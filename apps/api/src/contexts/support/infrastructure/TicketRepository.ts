import type { Pool, PoolClient } from "pg";
import type { ITicketRepository, TicketListFilter, StatusCount } from "../domain/ports";
import {
  Ticket,
  type TicketStatus,
  type TicketPriority,
  type AuthorKind,
  type TicketMessage,
} from "../domain/Ticket";

const TICKET_COLS =
  "id, tenant_id, created_by, created_by_email, subject, status, priority, last_reply_at, last_reply_by, created_at, updated_at";

// List caps. A helpdesk realistically stays well under these; the cap also bounds
// the memory a single request can materialize (a tenant can't spam the desk into
// loading unbounded rows). List rows carry no message thread (summary projection).
// ponytail: hard LIMIT, no pagination — add keyset pagination when a desk grows past this.
const ADMIN_LIST_LIMIT = 500;
const TENANT_LIST_LIMIT = 200;

interface TicketRow {
  id: string;
  tenant_id: string;
  created_by: string;
  created_by_email: string;
  subject: string;
  status: string;
  priority: string;
  last_reply_at: Date | null;
  last_reply_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  id: string;
  author_kind: string;
  author_id: string | null;
  author_email: string;
  body: string;
  created_at: Date;
}

function toMessage(r: MessageRow): TicketMessage {
  return {
    id: r.id,
    authorKind: r.author_kind as AuthorKind,
    authorId: r.author_id,
    authorEmail: r.author_email,
    body: r.body,
    createdAt: r.created_at,
  };
}

function toAggregate(t: TicketRow, messages: TicketMessage[]): Ticket {
  return Ticket.reconstitute(t.id, {
    tenantId: t.tenant_id,
    createdBy: t.created_by,
    createdByEmail: t.created_by_email,
    subject: t.subject,
    status: t.status as TicketStatus,
    priority: t.priority as TicketPriority,
    messages,
    lastReplyAt: t.last_reply_at,
    lastReplyBy: t.last_reply_by as AuthorKind | null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  });
}

/**
 * SQL implementation of ITicketRepository (pg Pool).
 *
 * Every operation runs inside a transaction that first sets the request-scoped
 * RLS GUC — `app.current_tenant` for the tenant plane, `app.is_admin` for the
 * admin plane — so Row-Level Security is honoured even under a restricted DB
 * role. Explicit WHERE clauses scope results in all cases (defense in depth).
 */
export class TicketRepository implements ITicketRepository {
  constructor(private readonly pool: Pool) {}

  private async runTenant<T>(tenantId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private async runAdmin<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.is_admin', 'true', true)");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private async insertNewMessages(client: PoolClient, ticket: Ticket): Promise<void> {
    for (const m of ticket.pullNewMessages()) {
      await client.query(
        `INSERT INTO support.ticket_messages
           (id, ticket_id, tenant_id, author_kind, author_id, author_email, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [m.id, ticket.id.value, ticket.tenantId, m.authorKind, m.authorId, m.authorEmail, m.body, m.createdAt]
      );
    }
  }

  private async upsertTicket(client: PoolClient, ticket: Ticket): Promise<void> {
    await client.query(
      `INSERT INTO support.tickets
         (id, tenant_id, created_by, created_by_email, subject, status, priority,
          last_reply_at, last_reply_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         status        = EXCLUDED.status,
         priority      = EXCLUDED.priority,
         last_reply_at = EXCLUDED.last_reply_at,
         last_reply_by = EXCLUDED.last_reply_by,
         updated_at    = EXCLUDED.updated_at`,
      [
        ticket.id.value,
        ticket.tenantId,
        ticket.createdBy,
        ticket.createdByEmail,
        ticket.subject,
        ticket.status,
        ticket.priority,
        ticket.lastReplyAt,
        ticket.lastReplyBy,
        ticket.createdAt,
        ticket.updatedAt,
      ]
    );
  }

  private persist(ticket: Ticket): (client: PoolClient) => Promise<void> {
    return async (client) => {
      await this.upsertTicket(client, ticket);
      await this.insertNewMessages(client, ticket);
    };
  }

  async save(ticket: Ticket): Promise<void> {
    await this.runTenant(ticket.tenantId, this.persist(ticket));
  }

  async saveAsAdmin(ticket: Ticket): Promise<void> {
    await this.runAdmin(this.persist(ticket));
  }

  async findByIdForTenant(id: string, tenantId: string): Promise<Ticket | null> {
    return this.runTenant(tenantId, async (client) => {
      const tr = await client.query<TicketRow>(
        `SELECT ${TICKET_COLS} FROM support.tickets WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      if (tr.rows.length === 0) return null;
      const mr = await client.query<MessageRow>(
        `SELECT id, author_kind, author_id, author_email, body, created_at
           FROM support.ticket_messages
          WHERE ticket_id = $1 AND tenant_id = $2
          ORDER BY created_at ASC`,
        [id, tenantId]
      );
      return toAggregate(tr.rows[0], mr.rows.map(toMessage));
    });
  }

  async listByTenant(tenantId: string): Promise<Ticket[]> {
    return this.runTenant(tenantId, async (client) => {
      const tr = await client.query<TicketRow>(
        `SELECT ${TICKET_COLS} FROM support.tickets
          WHERE tenant_id = $1
          ORDER BY COALESCE(last_reply_at, created_at) DESC
          LIMIT ${TENANT_LIST_LIMIT}`,
        [tenantId]
      );
      return tr.rows.map((r) => toAggregate(r, []));
    });
  }

  async findByIdAsAdmin(id: string): Promise<Ticket | null> {
    return this.runAdmin(async (client) => {
      const tr = await client.query<TicketRow>(
        `SELECT ${TICKET_COLS} FROM support.tickets WHERE id = $1`,
        [id]
      );
      if (tr.rows.length === 0) return null;
      const mr = await client.query<MessageRow>(
        `SELECT id, author_kind, author_id, author_email, body, created_at
           FROM support.ticket_messages
          WHERE ticket_id = $1
          ORDER BY created_at ASC`,
        [id]
      );
      return toAggregate(tr.rows[0], mr.rows.map(toMessage));
    });
  }

  async listAllAsAdmin(filter: TicketListFilter): Promise<Ticket[]> {
    return this.runAdmin(async (client) => {
      const conds: string[] = [];
      const params: unknown[] = [];
      if (filter.status) {
        params.push(filter.status);
        conds.push(`status = $${params.length}`);
      }
      if (filter.search) {
        params.push(`%${filter.search}%`);
        conds.push(`(subject ILIKE $${params.length} OR created_by_email ILIKE $${params.length})`);
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const tr = await client.query<TicketRow>(
        `SELECT ${TICKET_COLS} FROM support.tickets
         ${where}
         ORDER BY COALESCE(last_reply_at, created_at) DESC
         LIMIT ${ADMIN_LIST_LIMIT}`,
        params
      );
      return tr.rows.map((r) => toAggregate(r, []));
    });
  }

  async countByStatusAsAdmin(): Promise<StatusCount[]> {
    return this.runAdmin(async (client) => {
      const r = await client.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::TEXT AS count FROM support.tickets GROUP BY status`
      );
      return r.rows.map((row) => ({
        status: row.status as TicketStatus,
        count: parseInt(row.count, 10),
      }));
    });
  }
}

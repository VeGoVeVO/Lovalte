import type { Ticket, TicketStatus } from "./Ticket";

export interface TicketListFilter {
  status?: TicketStatus;
  /** Case-insensitive match against subject or the opener's email. */
  search?: string;
}

export interface StatusCount {
  status: TicketStatus;
  count: number;
}

/**
 * Persistence port for the Ticket aggregate.
 *
 * Two access planes share one table, separated by Row-Level Security:
 *   - tenant plane (`save` / `*ForTenant` / `listByTenant`): scoped to one tenant.
 *   - admin plane  (`saveAsAdmin` / `*AsAdmin`): the platform super-admin, cross-tenant.
 * Both save methods persist the ticket row and any messages pulled from the
 * aggregate; the plane (not the caller) decides how RLS is satisfied.
 *
 * NOTE: the `list*` methods return Ticket aggregates with an EMPTY message thread
 * (summary projection only). Callers needing the thread must use `findById*`.
 */
export interface ITicketRepository {
  save(ticket: Ticket): Promise<void>;
  saveAsAdmin(ticket: Ticket): Promise<void>;

  // ── tenant plane ──────────────────────────────────────────────────────────
  findByIdForTenant(id: string, tenantId: string): Promise<Ticket | null>;
  listByTenant(tenantId: string): Promise<Ticket[]>;

  // ── admin plane (cross-tenant) ─────────────────────────────────────────────
  findByIdAsAdmin(id: string): Promise<Ticket | null>;
  listAllAsAdmin(filter: TicketListFilter): Promise<Ticket[]>;
  countByStatusAsAdmin(): Promise<StatusCount[]>;
}

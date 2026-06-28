import type { Pool, PoolClient } from "pg";
import type { IMemberRepository } from "../domain/ports";
import { Member } from "../domain/Member";
import { MemberId } from "../domain/MemberId";
import { PointsBalance } from "../domain/PointsBalance";

interface MemberRow {
  id: string;
  tenant_id: string;
  pass_id: string;
  display_name: string | null;
  email: string | null;
  current_tier: string;
  status: string;
  joined_at: Date;
}

interface MemberWithBalanceRow extends MemberRow {
  balance: string;
}

/** SQL implementation of IMemberRepository using the pg Pool. */
export class MemberRepository implements IMemberRepository {
  constructor(private readonly pool: Pool) {}

  private async setTenantCtx(client: PoolClient, tenantId: string): Promise<void> {
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
  }

  /** Compute balance from the append-only ledger for a single member. */
  private async fetchBalance(
    client: PoolClient,
    memberId: string,
    tenantId: string,
  ): Promise<number> {
    const r = await client.query<{ balance: string }>(
      `SELECT COALESCE(SUM(delta), 0)::TEXT AS balance
       FROM loyalty.point_ledger
       WHERE member_id = $1 AND tenant_id = $2`,
      [memberId, tenantId],
    );
    return parseInt(r.rows[0].balance, 10);
  }

  private toAggregate(row: MemberRow, balance: number): Member {
    return Member.reconstitute({
      id: MemberId.from(row.id),
      tenantId: row.tenant_id,
      passId: row.pass_id,
      displayName: row.display_name,
      email: row.email,
      balance: PointsBalance.of(balance),
      currentTier: row.current_tier,
      enrolledAt: row.joined_at,
      status: row.status as "active" | "suspended" | "deleted",
    });
  }

  async findById(id: string, tenantId: string): Promise<Member | null> {
    const client = await this.pool.connect();
    try {
      await this.setTenantCtx(client, tenantId);
      const result = await client.query<MemberRow>(
        `SELECT id, tenant_id, pass_id, display_name, email,
                current_tier, status, joined_at
         FROM loyalty.members
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      const balance = await this.fetchBalance(client, row.id, tenantId);
      return this.toAggregate(row, balance);
    } finally {
      client.release();
    }
  }

  async findByPassId(passId: string, tenantId: string): Promise<Member | null> {
    const client = await this.pool.connect();
    try {
      await this.setTenantCtx(client, tenantId);
      const result = await client.query<MemberRow>(
        `SELECT id, tenant_id, pass_id, display_name, email,
                current_tier, status, joined_at
         FROM loyalty.members
         WHERE pass_id = $1 AND tenant_id = $2`,
        [passId, tenantId],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      const balance = await this.fetchBalance(client, row.id, tenantId);
      return this.toAggregate(row, balance);
    } finally {
      client.release();
    }
  }

  async listByTenant(tenantId: string): Promise<Member[]> {
    const client = await this.pool.connect();
    try {
      await this.setTenantCtx(client, tenantId);
      const result = await client.query<MemberWithBalanceRow>(
        `SELECT m.id, m.tenant_id, m.pass_id, m.display_name, m.email,
                m.current_tier, m.status, m.joined_at,
                COALESCE(SUM(l.delta), 0)::TEXT AS balance
         FROM loyalty.members m
         LEFT JOIN loyalty.point_ledger l
           ON l.member_id = m.id AND l.tenant_id = m.tenant_id
         WHERE m.tenant_id = $1 AND m.status != 'deleted'
         GROUP BY m.id, m.tenant_id, m.pass_id, m.display_name, m.email,
                  m.current_tier, m.status, m.joined_at
         ORDER BY m.joined_at DESC`,
        [tenantId],
      );
      return result.rows.map((row) => this.toAggregate(row, parseInt(row.balance, 10)));
    } finally {
      client.release();
    }
  }

  async save(member: Member): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.setTenantCtx(client, member.tenantId);
      await client.query(
        `INSERT INTO loyalty.members
           (id, tenant_id, pass_id, display_name, email,
            current_tier, status, joined_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           current_tier = EXCLUDED.current_tier,
           status       = EXCLUDED.status,
           updated_at   = now()`,
        [
          member.id.value,
          member.tenantId,
          member.passId,
          member.displayName,
          member.email,
          member.currentTier,
          member.status,
          member.enrolledAt,
        ],
      );
    } finally {
      client.release();
    }
  }
}

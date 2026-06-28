import type { Pool } from "pg";
import type { ILedgerRepository, LedgerRow } from "../domain/ports";

interface LedgerDbRow {
  id: string;
  member_id: string;
  tenant_id: string;
  delta: number;
  reason: string;
  recorded_at: Date;
}

/**
 * SQL implementation of ILedgerRepository.
 * The point_ledger table is append-only (DB rules prevent UPDATE/DELETE).
 */
export class LedgerRepository implements ILedgerRepository {
  constructor(private readonly pool: Pool) {}

  async append(row: {
    memberId: string;
    tenantId: string;
    delta: number;
    reason: string;
    referenceId?: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [row.tenantId]);
      await client.query(
        `INSERT INTO loyalty.point_ledger
           (tenant_id, member_id, delta, reason, reference_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.tenantId, row.memberId, row.delta, row.reason, row.referenceId ?? null],
      );
    } finally {
      client.release();
    }
  }

  async findByMember(
    memberId: string,
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: LedgerRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);

      const dataResult = await client.query<LedgerDbRow>(
        `SELECT id, member_id, tenant_id, delta, reason, recorded_at
         FROM loyalty.point_ledger
         WHERE member_id = $1 AND tenant_id = $2
         ORDER BY recorded_at DESC
         LIMIT $3 OFFSET $4`,
        [memberId, tenantId, pageSize, offset],
      );

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM loyalty.point_ledger
         WHERE member_id = $1 AND tenant_id = $2`,
        [memberId, tenantId],
      );

      return {
        rows: dataResult.rows.map((r) => ({
          id: r.id,
          memberId: r.member_id,
          tenantId: r.tenant_id,
          delta: r.delta,
          reason: r.reason,
          recordedAt: r.recorded_at,
        })),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } finally {
      client.release();
    }
  }
}

import type { Pool } from "pg";
import type { IScanPreviewLookup, ScanPreview } from "../application/ports";

interface ScanPreviewRow {
  pass_id: string;
  card_name: string | null;
  card_type: string;
  member_id: string;
  display_name: string | null;
  email: string | null;
  balance: string;
  current_tier: string;
  status: string;
  joined_at: Date;
}

/**
 * Staff-safe scan preview read model. It performs an RLS-scoped read across the
 * pass, card snapshot, and member tables by ID only.
 */
export class SqlScanPreviewLookup implements IScanPreviewLookup {
  constructor(private readonly pool: Pool) {}

  async findPreview(passId: string, tenantId: string): Promise<ScanPreview | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const res = await client.query<ScanPreviewRow>(
        `SELECT
           p.id AS pass_id,
           COALESCE(ct.name, pt.description, 'Loyalty card') AS card_name,
           pt.description AS card_type,
           m.id AS member_id,
           m.display_name,
           m.email,
           COALESCE(SUM(l.delta), 0)::TEXT AS balance,
           m.current_tier,
           m.status,
           m.joined_at
         FROM passes p
         JOIN pass_types pt
           ON pt.id = p.pass_type_id AND pt.tenant_id = p.tenant_id
         JOIN loyalty.members m
           ON m.pass_id = p.id AND m.tenant_id = p.tenant_id
         LEFT JOIN card_templates ct
           ON ct.id = p.pass_type_id AND ct.tenant_id = p.tenant_id
         LEFT JOIN loyalty.point_ledger l
           ON l.member_id = m.id AND l.tenant_id = m.tenant_id
         WHERE p.id = $1
           AND p.tenant_id = $2
           AND p.voided = false
           AND m.status != 'deleted'
         GROUP BY p.id, ct.name, pt.description, m.id, m.display_name, m.email,
                  m.current_tier, m.status, m.joined_at
         LIMIT 1`,
        [passId, tenantId],
      );
      await client.query("COMMIT");

      const row = res.rows[0];
      if (!row) return null;

      return {
        passId: row.pass_id,
        cardName: row.card_name ?? "Loyalty card",
        cardType: row.card_type,
        member: {
          id: row.member_id,
          displayName: row.display_name,
          email: row.email,
          balance: parseInt(row.balance, 10),
          tier: row.current_tier,
          status: row.status,
          enrolledAt: row.joined_at.toISOString(),
        },
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

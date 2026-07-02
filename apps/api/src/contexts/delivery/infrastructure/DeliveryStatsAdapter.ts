import type { Pool } from "pg";
import type { DeliveryStatsDTO, IDeliveryStatsPort } from "../domain/ports";

interface StatsRow {
  passes: string;
  registered_devices: string;
  up_to_date_devices: string;
  stale_devices: string;
  push_failures_24h: string;
  last_push_at: Date | null;
}

/**
 * Merchant verification query (GET /api/v1/card-templates/:templateId/delivery-status).
 * templateId == pass_type_id == the card_templates.id that was frozen into
 * pass_types on publish (see pass-issuance's SqlPassTemplateRepository.upsert),
 * so this reads the shared `passes`/`push_log` tables directly - no cross-context
 * import. Tenant scoping via `p.tenant_id = $2` doubles as the ownership check:
 * a templateId that isn't the caller's tenant's simply yields all zeros.
 */
export class DeliveryStatsAdapter implements IDeliveryStatsPort {
  constructor(private readonly pool: Pool) {}

  async getStats(templateId: string, tenantId: string): Promise<DeliveryStatsDTO> {
    const r = await this.pool.query<StatsRow>(
      `WITH p AS (
         SELECT id, last_updated FROM passes WHERE pass_type_id = $1 AND tenant_id = $2
       ),
       regs AS (
         SELECT reg.last_fetched_at, p.last_updated
         FROM delivery.registrations reg
         JOIN p ON p.id = reg.pass_id
       )
       SELECT
         (SELECT COUNT(*) FROM p) AS passes,
         (SELECT COUNT(*) FROM regs) AS registered_devices,
         (SELECT COUNT(*) FROM regs
            WHERE last_fetched_at IS NOT NULL AND last_fetched_at >= last_updated) AS up_to_date_devices,
         (SELECT COUNT(*) FROM regs
            WHERE last_fetched_at IS NULL OR last_fetched_at < last_updated) AS stale_devices,
         (SELECT COUNT(*) FROM push_log pl JOIN p ON p.id = pl.pass_id
            WHERE pl.ok = false AND pl.created_at > now() - interval '24 hours') AS push_failures_24h,
         (SELECT MAX(pl.created_at) FROM push_log pl JOIN p ON p.id = pl.pass_id) AS last_push_at`,
      [templateId, tenantId],
    );

    const row = r.rows[0];
    return {
      passes: parseInt(row.passes, 10),
      registeredDevices: parseInt(row.registered_devices, 10),
      upToDateDevices: parseInt(row.up_to_date_devices, 10),
      staleDevices: parseInt(row.stale_devices, 10),
      pushFailures24h: parseInt(row.push_failures_24h, 10),
      lastPushAt: row.last_push_at,
    };
  }
}

import type { Pool } from "pg";
import type { IPassLookup } from "../application/ports";

/**
 * Resolves a scanned passId to whether it belongs to the scanning tenant.
 *
 * Implemented as a read-only, RLS-scoped existence check: it sets
 * `app.current_tenant` for the transaction so the `passes_select` row-level
 * policy (`tenant_id = app_current_tenant()`) hides other tenants' passes. A
 * foreign card therefore returns false - tenant isolation for free, no crypto.
 *
 * ponytail: this reads the pass-issuance context's `passes` table directly (a
 * read-only anti-corruption query, by id only). If the contexts ever split
 * databases, replace this with a `scannable_passes(pass_id, tenant_id)`
 * projection in the scanning schema, fed by PassIssued / PassVoided events.
 */
export class SqlPassLookup implements IPassLookup {
  constructor(private readonly pool: Pool) {}

  async existsForTenant(passId: string, tenantId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const res = await client.query(
        `SELECT 1 FROM passes
          WHERE id = $1 AND tenant_id = $2 AND voided = false
          LIMIT 1`,
        [passId, tenantId],
      );
      await client.query("COMMIT");
      return (res.rowCount ?? 0) > 0;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

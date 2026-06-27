import type { Pool } from "pg";
import type { ITierRepository } from "../domain/ports";
import type { TierRule } from "../domain/TierRule";

interface TierRow {
  name: string;
  min_points: number;
}

/** SQL implementation of ITierRepository. */
export class TierRepository implements ITierRepository {
  constructor(private readonly pool: Pool) {}

  async findByTenant(tenantId: string): Promise<TierRule[]> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "SELECT set_config('app.current_tenant', $1, true)",
        [tenantId],
      );
      const result = await client.query<TierRow>(
        `SELECT name, min_points
         FROM loyalty.tiers
         WHERE tenant_id = $1
         ORDER BY min_points ASC`,
        [tenantId],
      );

      // Default bronze tier when no rules are configured.
      if (result.rows.length === 0) {
        return [{ name: "bronze", minPoints: 0 }];
      }

      return result.rows.map((r) => ({
        name: r.name,
        minPoints: r.min_points,
      }));
    } finally {
      client.release();
    }
  }
}

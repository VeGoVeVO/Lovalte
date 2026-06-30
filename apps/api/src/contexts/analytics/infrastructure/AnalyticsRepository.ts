import type { Pool, PoolClient } from "pg";
import type { AnalyticsEventData, EventType } from "../domain/AnalyticsEvent";
import type { IAnalyticsRepository, OverviewDTO, TimeseriesPoint } from "../application/ports";

/**
 * Infrastructure implementation of IAnalyticsRepository.
 * All SQL is parameterized ($1, $2, …) - never string-interpolated.
 * Every query runs inside a transaction that sets app.current_tenant so RLS is satisfied;
 * the WHERE tenant_id = $N clauses add belt-and-suspenders isolation.
 */
export class AnalyticsRepository implements IAnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Run `fn` inside a transaction with the tenant RLS context set.
   * Uses `set_config('app.current_tenant', tenantId, true)` so the setting
   * is local to this transaction (safe with connection pooling).
   */
  private async withTenant<T>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Write path
  // ──────────────────────────────────────────────────────────────────────────

  async insertEvent(data: AnalyticsEventData): Promise<void> {
    await this.withTenant(data.tenantId, async (client) => {
      await client.query(
        `INSERT INTO analytics_events (tenant_id, type, occurred_at, payload)
         VALUES ($1, $2, $3, $4)`,
        [data.tenantId, data.type, data.occurredAt, JSON.stringify(data.payload)],
      );
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Read path - on-the-fly GROUP BY (no materialized views required at M-tier)
  // ──────────────────────────────────────────────────────────────────────────

  async getOverview(tenantId: string): Promise<OverviewDTO> {
    return this.withTenant(tenantId, async (client) => {
      // Total distinct members: count pass_issued events with a memberId payload
      const membersRes = await client.query<{ total: string }>(
        `SELECT COUNT(DISTINCT (payload->>'memberId')) AS total
         FROM   analytics_events
         WHERE  tenant_id = $1
           AND  type = $2
           AND  payload->>'memberId' IS NOT NULL`,
        [tenantId, "pass_issued"],
      );

      // Total scans = scan + redeem events combined
      const scansRes = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM   analytics_events
         WHERE  tenant_id = $1
           AND  type = ANY($2::text[])`,
        [tenantId, ["scan", "redeem"]],
      );

      // Total redemptions = redeem events
      const redemptionsRes = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM   analytics_events
         WHERE  tenant_id = $1
           AND  type = $2`,
        [tenantId, "redeem"],
      );

      // Points liability = net sum of all pointsDelta across earned/redeemed events
      const liabilityRes = await client.query<{ liability: string }>(
        `SELECT COALESCE(
           SUM((payload->>'pointsDelta')::int),
           0
         ) AS liability
         FROM   analytics_events
         WHERE  tenant_id = $1
           AND  type = ANY($2::text[])
           AND  payload->>'pointsDelta' IS NOT NULL`,
        [tenantId, ["points_earned", "points_redeemed"]],
      );

      // Cards removed from Apple Wallet (PassRemoved → pass_removed events)
      const removedRes = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM   analytics_events
         WHERE  tenant_id = $1
           AND  type = $2`,
        [tenantId, "pass_removed"],
      );

      return {
        totalMembers: parseInt(membersRes.rows[0]?.total ?? "0", 10),
        totalScans: parseInt(scansRes.rows[0]?.total ?? "0", 10),
        totalRedemptions: parseInt(redemptionsRes.rows[0]?.total ?? "0", 10),
        pointsLiability: parseInt(liabilityRes.rows[0]?.liability ?? "0", 10),
        cardsRemoved: parseInt(removedRes.rows[0]?.total ?? "0", 10),
      };
    });
  }

  async purgeByTenant(tenantId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.purge', 'on', true)");
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      await client.query("DELETE FROM analytics_events WHERE tenant_id = $1", [tenantId]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getTimeseries(
    tenantId: string,
    metric: EventType,
    from: Date,
    to: Date,
  ): Promise<TimeseriesPoint[]> {
    return this.withTenant(tenantId, async (client) => {
      const res = await client.query<{ day: string; count: string }>(
        `SELECT
           (occurred_at AT TIME ZONE 'UTC')::date::text AS day,
           COUNT(*) AS count
         FROM   analytics_events
         WHERE  tenant_id = $1
           AND  type = $2
           AND  occurred_at >= $3
           AND  occurred_at <= $4
         GROUP  BY (occurred_at AT TIME ZONE 'UTC')::date
         ORDER  BY 1 ASC`,
        [tenantId, metric, from, to],
      );
      return res.rows.map((r) => ({
        day: r.day,
        count: parseInt(r.count, 10),
      }));
    });
  }
}

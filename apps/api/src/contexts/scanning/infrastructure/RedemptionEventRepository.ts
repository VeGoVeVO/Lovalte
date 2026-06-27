import type { Pool } from "pg";
import { withTransaction } from "../../../db/pool";
import type { IRedemptionEventRepository } from "../application/ports";
import type { RedemptionEvent } from "../domain/RedemptionEvent";

/** Parameterised-SQL unique violation code from PostgreSQL. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * PostgreSQL implementation of IRedemptionEventRepository.
 *
 * Security:
 *  - Parameterized SQL only — no string concatenation.
 *  - Sets app.current_tenant per transaction so RLS policy applies to the INSERT.
 *  - Silently ignores idempotency_key unique violations (23505) — the Redis
 *    idempotency guard already deduplicates before this path is reached, but the
 *    DB constraint acts as a final belt-and-suspenders for race conditions.
 */
export class RedemptionEventRepository implements IRedemptionEventRepository {
  constructor(private readonly pool: Pool) {}

  async save(event: RedemptionEvent): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      // Set tenant context so RLS policy (tenant_id = app_current_tenant()) applies
      await client.query(
        "SELECT set_config('app.current_tenant', $1, true)",
        [event.tenantId],
      );

      try {
        await client.query(
          `INSERT INTO redemption_events
             (id, tenant_id, pass_id, action, delta, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            event.id.value,
            event.tenantId,
            event.passId,
            event.action,
            event.delta,
            event.idempotencyKey,
            event.createdAt,
          ],
        );
      } catch (e: unknown) {
        // Unique violation on idempotency_key: already persisted — treat as success
        if (
          e instanceof Error &&
          (e as Error & { code?: string }).code === PG_UNIQUE_VIOLATION
        ) {
          return;
        }
        throw e;
      }
    });
  }
}

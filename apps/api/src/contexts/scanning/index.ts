import type { ContextModule } from "../../http/app";
import { RedeemScanHandler } from "./application/RedeemScanHandler";
import { SqlPassLookup } from "./infrastructure/SqlPassLookup";
import { RedisCacheStore } from "./infrastructure/RedisCacheStore";
import { RedemptionEventRepository } from "./infrastructure/RedemptionEventRepository";
import { registerScanningRoutes } from "./presentation/routes";

/**
 * Scanning & Redemption context module.
 *
 * Wires up:
 *  - SqlPassLookup   — RLS-scoped resolve of a scanned passId → owning tenant
 *  - RedisCacheStore — idempotency window (30 s) for double-taps / retries
 *  - RedemptionEventRepository — append-only pg INSERT
 *  - RedeemScanHandler        — orchestrates the full scan flow
 *
 * Cross-context integration (event bus only — never direct imports):
 *  Publishes: RedemptionApplied → consumed by the Membership context to
 *             award or redeem points on the member's balance.
 */
export const registerScanning: ContextModule = async (app, deps) => {
  const passLookup = new SqlPassLookup(deps.pool);
  const cache = new RedisCacheStore(deps.redis);
  const repo = new RedemptionEventRepository(deps.pool);
  const handler = new RedeemScanHandler(repo, passLookup, cache, deps.bus, deps.clock);

  registerScanningRoutes(app, deps, handler);
};

import type { ContextModule } from "../../http/app";
import { RedeemScanHandler } from "./application/RedeemScanHandler";
import { QrVerifier } from "./infrastructure/QrVerifier";
import { RedisCacheStore } from "./infrastructure/RedisCacheStore";
import { RedemptionEventRepository } from "./infrastructure/RedemptionEventRepository";
import { registerScanningRoutes } from "./presentation/routes";

/**
 * Scanning & Redemption context module.
 *
 * Wires up:
 *  - QrVerifier     — HS256 JWT verification using QR_TOKEN_SECRET
 *  - RedisCacheStore — nonce replay guard (90 d) + idempotency (30 s)
 *  - RedemptionEventRepository — append-only pg INSERT
 *  - RedeemScanHandler        — orchestrates the full scan flow
 *
 * Cross-context integration (event bus only — never direct imports):
 *  Publishes: RedemptionApplied → consumed by the Membership context to
 *             award or redeem points on the member's balance.
 */
export const registerScanning: ContextModule = async (app, deps) => {
  const verifier = new QrVerifier(deps.config.QR_TOKEN_SECRET);
  const cache = new RedisCacheStore(deps.redis);
  const repo = new RedemptionEventRepository(deps.pool);
  const handler = new RedeemScanHandler(repo, verifier, cache, deps.bus, deps.clock);

  registerScanningRoutes(app, deps, handler);
};

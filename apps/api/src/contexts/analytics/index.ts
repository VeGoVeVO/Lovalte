import type { FastifyInstance } from "fastify";
import type { ContextModule } from "../../http/app";
import type { Deps } from "../../shared/deps";
import { AnalyticsRepository } from "./infrastructure/AnalyticsRepository";
import { GetAnalyticsOverviewHandler } from "./application/GetAnalyticsOverviewHandler";
import { GetAnalyticsTimeseriesHandler } from "./application/GetAnalyticsTimeseriesHandler";
import { registerAnalyticsRoutes } from "./presentation/routes";
import { createAnalyticsEvent } from "./domain/AnalyticsEvent";

/**
 * Analytics bounded context - ContextModule entry point.
 *
 * Responsibilities:
 *  1. Wire infrastructure (AnalyticsRepository) with application handlers.
 *  2. Subscribe to cross-context domain events via deps.bus (Anti-Corruption Layer).
 *     Each subscription maps a domain event → an analytics_events row insert.
 *  3. Register REST routes on the Fastify instance.
 *
 * Integration rule: NEVER import another context's domain objects.
 *                   Integrate ONLY through the event bus payload (ids + primitives).
 */
export const registerAnalytics: ContextModule = async (
  app: FastifyInstance,
  deps: Deps,
): Promise<void> => {
  const repo = new AnalyticsRepository(deps.pool);
  const overviewHandler = new GetAnalyticsOverviewHandler(repo);
  const timeseriesHandler = new GetAnalyticsTimeseriesHandler(repo);

  // ── Anti-Corruption Layer: domain event → analytics_events insert ──────

  /**
   * Safely extract tenantId from event payload; returns null if absent.
   * Missing tenantId is logged and skipped - analytics failures must not
   * propagate back into the domain event bus and disrupt other subscribers.
   */
  function extractTenantId(payload: Record<string, unknown>): string | null {
    const tid = payload["tenantId"];
    if (typeof tid === "string" && tid.trim().length > 0) return tid.trim();
    return null;
  }

  async function ingest(
    type: string,
    tenantId: string,
    occurredAt: Date,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const data = createAnalyticsEvent(type, tenantId, occurredAt, payload);
      await repo.insertEvent(data);
    } catch (err) {
      // Analytics ingestion is best-effort - do not crash the bus.
      console.error("[analytics] ingestion error for type=%s tenant=%s: %s", type, tenantId, err);
    }
  }

  // PassIssued → pass_issued
  deps.bus.subscribe("PassIssued", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("pass_issued", tenantId, event.occurredAt, {
      passId: event.payload["passId"] ?? event.aggregateId,
      memberId: event.payload["memberId"],
    });
  });

  // RedemptionApplied → scan (award) or redeem (redeem)
  deps.bus.subscribe("RedemptionApplied", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    const action = event.payload["action"] as string | undefined;
    const type = action === "redeem" ? "redeem" : "scan";
    await ingest(type, tenantId, event.occurredAt, {
      passId: event.payload["passId"],
      pointsDelta: event.payload["delta"],
      action,
    });
  });

  // PointsEarned → points_earned
  deps.bus.subscribe("PointsEarned", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("points_earned", tenantId, event.occurredAt, {
      memberId: event.payload["memberId"],
      pointsDelta: event.payload["delta"],
      newBalance: event.payload["newBalance"],
    });
  });

  // TierUpgraded → tier_upgraded
  deps.bus.subscribe("TierUpgraded", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("tier_upgraded", tenantId, event.occurredAt, {
      memberId: event.payload["memberId"],
      tierFrom: event.payload["from"],
      tierTo: event.payload["to"],
    });
  });

  // PassRemoved → pass_removed (customer deleted the card from Apple Wallet)
  deps.bus.subscribe("PassRemoved", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("pass_removed", tenantId, event.occurredAt, {
      passId: event.payload["passId"] ?? event.aggregateId,
      serial: event.payload["serial"],
    });
  });

  // CardTemplatePublished → template_published
  deps.bus.subscribe("CardTemplatePublished", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("template_published", tenantId, event.occurredAt, {
      templateId: event.payload["templateId"] ?? event.aggregateId,
    });
  });

  // ── REST routes ────────────────────────────────────────────────────────
  registerAnalyticsRoutes(app, deps, overviewHandler, timeseriesHandler);
};

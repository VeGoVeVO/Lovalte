import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { GetAnalyticsOverviewHandler } from "../application/GetAnalyticsOverviewHandler";
import type { GetAnalyticsTimeseriesHandler } from "../application/GetAnalyticsTimeseriesHandler";

/** Zod schema for timeseries query parameters. */
const timeseriesQuerySchema = z.object({
  metric: z.string().min(1),
  from: z
    .string()
    .refine((s) => !isNaN(Date.parse(s)), { message: "Invalid 'from' date" }),
  to: z
    .string()
    .refine((s) => !isNaN(Date.parse(s)), { message: "Invalid 'to' date" }),
});

/**
 * Register all analytics REST routes on the Fastify instance.
 * All routes require owner or manager role.
 * tenantId is always extracted from the verified session - never from the request body.
 */
export function registerAnalyticsRoutes(
  app: FastifyInstance,
  deps: Deps,
  overviewHandler: GetAnalyticsOverviewHandler,
  timeseriesHandler: GetAnalyticsTimeseriesHandler,
): void {
  const auth = requireAuth(deps.config.SESSION_SECRET, ["owner", "manager"]);

  /**
   * GET /api/v1/analytics/overview
   * Returns KPI snapshot: totalMembers, totalScans, totalRedemptions, pointsLiability.
   */
  app.get(
    "/api/v1/analytics/overview",
    { preHandler: auth },
    async (req, reply) => {
      const { tenantId } = getAuth(req);
      const r = await overviewHandler.execute(tenantId);
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    },
  );

  /**
   * GET /api/v1/analytics/timeseries?metric=<type>&from=<iso>&to=<iso>
   * Returns daily event counts for the requested metric and date range.
   */
  app.get(
    "/api/v1/analytics/timeseries",
    { preHandler: auth },
    async (req, reply) => {
      const { tenantId } = getAuth(req);
      const q = parse(timeseriesQuerySchema, req.query);
      const r = await timeseriesHandler.execute({
        tenantId,
        metric: q.metric,
        from: q.from,
        to: q.to,
      });
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    },
  );
}

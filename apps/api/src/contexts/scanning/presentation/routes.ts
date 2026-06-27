import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { RedeemScanHandler } from "../application/RedeemScanHandler";

const redeemBodySchema = z.object({
  qrToken: z.string().min(10).max(2048),
  action: z.enum(["award", "redeem"]),
  amount: z.number().int().positive(),
});

/**
 * Register all scanning context routes on the Fastify app.
 *
 * POST /api/v1/scan/redeem
 *   Auth:           session cookie; roles: owner | manager | staff
 *   Headers:        Idempotency-Key: <uuid>   (required)
 *   Body:           { qrToken, action, amount }
 *   Response 200:   { eventId, passId, action, delta }
 *   Response 409:   QR already redeemed (nonce replay)
 *   Response 400:   validation failure or missing Idempotency-Key
 *   Response 401/403: auth failure
 */
export function registerScanningRoutes(
  app: FastifyInstance,
  deps: Deps,
  handler: RedeemScanHandler,
): void {
  app.post(
    "/api/v1/scan/redeem",
    {
      preHandler: requireAuth(deps.config.SESSION_SECRET, ["owner", "manager", "staff"]),
    },
    async (req, reply) => {
      // Extract and validate the Idempotency-Key header
      const rawHeader = req.headers["idempotency-key"];
      const idempotencyKey =
        typeof rawHeader === "string"
          ? rawHeader
          : Array.isArray(rawHeader)
            ? rawHeader[0]
            : undefined;

      if (!idempotencyKey) {
        return reply
          .status(400)
          .send({ error: "MISSING_HEADER", message: "Idempotency-Key header is required" });
      }

      const body = parse(redeemBodySchema, req.body);
      const auth = getAuth(req);

      const result = await handler.execute({
        qrPayload: body.qrToken,
        action: body.action,
        amount: body.amount,
        idempotencyKey,
        callerTenantId: auth.tenantId,
        staffUserId: auth.userId,
      });

      if (!result.ok) {
        throw result.error;
      }

      return reply.status(200).send(result.value);
    },
  );
}

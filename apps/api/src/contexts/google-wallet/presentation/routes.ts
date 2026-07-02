import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { GetPassSaveUrlHandler } from "../application/GetPassSaveUrlHandler";
import { verifyToken, DOWNLOAD_TOKEN_MAX_AGE_MS } from "../../pass-issuance/application/enrollTokens";

const passIdParams = z.object({ passId: z.string().uuid() }).strict();
const downloadQuerySchema = z.object({ t: z.string().min(8).max(2048) });

export function registerGoogleWalletRoutes(
  app: FastifyInstance,
  deps: Deps,
  handlers: { getSaveUrl: GetPassSaveUrlHandler },
): void {
  const auth = requireAuth(deps.config.SESSION_SECRET);

  app.get(
    "/api/v1/passes/:passId/google-wallet-url",
    { preHandler: auth },
    async (req, reply) => {
      const { passId } = parse(passIdParams, req.params);
      const { tenantId } = getAuth(req);
      const r = await handlers.getSaveUrl.execute({ passId, tenantId });
      if (!r.ok) throw r.error;
      return reply.send({ data: r.value });
    },
  );

  // GET /api/v1/public/passes/:passId/google-wallet-url?t=<downloadToken> - PUBLIC token-gated save URL
  app.get("/api/v1/public/passes/:passId/google-wallet-url", async (req, reply) => {
    const { passId } = parse(passIdParams, req.params);
    const query = parse(downloadQuerySchema, req.query);
    const claims = verifyToken(deps.config.QR_TOKEN_SECRET, query.t, "download", DOWNLOAD_TOKEN_MAX_AGE_MS);
    if (!claims || claims.passId !== passId || !claims.tenantId) {
      return reply
        .status(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
    }
    const r = await handlers.getSaveUrl.execute({ passId, tenantId: claims.tenantId });
    if (!r.ok) throw r.error;
    return reply.send({ data: r.value });
  });
}

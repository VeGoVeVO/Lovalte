import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { GetPassSaveUrlHandler } from "../application/GetPassSaveUrlHandler";

const passIdParams = z.object({ passId: z.string().uuid() }).strict();

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
}

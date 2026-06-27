import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { Deps } from "../shared/deps";
import { registerErrorHandler } from "./errors";

/** A bounded context plugs into the API by exporting one of these. */
export type ContextModule = (app: FastifyInstance, deps: Deps) => Promise<void> | void;

export async function buildApp(deps: Deps, modules: ContextModule[]): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.config.NODE_ENV !== "test",
    bodyLimit: 1_048_576,
    // Behind Caddy in production: trust X-Forwarded-* so rate-limiting keys on the
    // real client IP and the secure-cookie/redirect logic sees the right protocol.
    // Off in dev/test so spoofed forwarded headers can't be trusted locally.
    trustProxy: deps.config.NODE_ENV === "production",
  });

  // Tolerate empty-body POSTs that still carry `Content-Type: application/json`
  // (e.g. POST .../publish with no payload). Fastify's default JSON parser throws
  // FST_ERR_CTP_EMPTY_JSON_BODY → treat an empty body as "no body" (undefined).
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const s = body as string;
      if (s === "" || s == null) return done(null, undefined);
      try {
        done(null, JSON.parse(s));
      } catch {
        const e = new Error("Invalid JSON body") as Error & { statusCode?: number; code?: string };
        e.statusCode = 400;
        e.code = "VALIDATION";
        done(e, undefined);
      }
    }
  );

  await app.register(cors, { origin: deps.config.APP_BASE_URL, credentials: true });
  await app.register(cookie, { secret: deps.config.SESSION_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  registerErrorHandler(app);
  app.get("/health", async () => ({ status: "ok" }));

  for (const mod of modules) {
    await mod(app, deps);
  }
  return app;
}

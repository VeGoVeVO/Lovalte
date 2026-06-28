import type { FastifyInstance } from "fastify";
import { DomainError } from "../kernel";

const STATUS: Record<string, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DOMAIN_ERROR: 422,
};

/** Single error envelope for the whole API: { error: { code, message, details? } }. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof DomainError) {
      const status = STATUS[error.code] ?? 422;
      return reply.status(status).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    if ((error as { name?: string }).name === "ZodError") {
      return reply.status(400).send({
        error: {
          code: "VALIDATION",
          message: "Invalid request",
          details: (error as unknown as { issues: unknown }).issues,
        },
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      return reply
        .status(429)
        .send({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
    }
    // Honor framework/client errors (bad content-type, malformed body, etc.) as 4xx
    // instead of masking them as 500s.
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: {
          code: (error as { code?: string }).code ?? "BAD_REQUEST",
          message: (error as Error).message,
        },
      });
    }
    app.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL", message: "Internal Server Error" } });
  });
}

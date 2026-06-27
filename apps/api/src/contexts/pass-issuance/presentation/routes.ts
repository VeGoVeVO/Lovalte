import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { IssuePassHandler } from "../application/IssuePassHandler";
import type { GetPassPkpassHandler } from "../application/GetPassPkpassHandler";
import type { GenerateQrTokenHandler } from "../application/GenerateQrTokenHandler";
import type { UpdatePassFieldsHandler } from "../application/UpdatePassFieldsHandler";
import type { CreateEnrollLinkHandler } from "../application/CreateEnrollLinkHandler";
import type { PublicEnrollHandler } from "../application/PublicEnrollHandler";
import { verifyToken } from "../application/enrollTokens";

interface Handlers {
  issuePass:        IssuePassHandler;
  getPassPkpass:    GetPassPkpassHandler;
  generateQrToken:  GenerateQrTokenHandler;
  updatePassFields: UpdatePassFieldsHandler;
  createEnrollLink: CreateEnrollLinkHandler;
  publicEnroll:     PublicEnrollHandler;
}

const issuePassBodySchema = z.object({
  memberId:    z.string().uuid(),
  templateId:  z.string().uuid(),
  fieldValues: z.array(z.object({
    key:           z.string().min(1),
    label:         z.string().min(1),
    value:         z.union([z.string(), z.number()]),
    changeMessage: z.string().optional(),
  })).optional(),
}).strict();

const updateFieldsBodySchema = z.object({
  fieldValues: z.array(z.object({
    key:           z.string().min(1),
    label:         z.string().min(1),
    value:         z.union([z.string(), z.number()]),
    changeMessage: z.string().optional(),
  })).min(1),
}).strict();

const passIdParamsSchema  = z.object({ passId: z.string().uuid() });
const qrTokenBodySchema   = z.object({ ttlSeconds: z.number().int().min(60).max(3600).optional() });
const enrollLinkBodySchema = z.object({ templateId: z.string().uuid() }).strict();
const publicEnrollBodySchema = z.object({ token: z.string().min(8).max(2048) }).strict();
const downloadQuerySchema  = z.object({ t: z.string().min(8).max(2048) });

/**
 * Registers pass-issuance routes under /api/v1/passes.
 *
 * Routes:
 *   POST   /api/v1/passes                      — Issue a new pass (idempotent)
 *   GET    /api/v1/passes/:passId/pkpass        — Download signed .pkpass
 *   POST   /api/v1/passes/:passId/qr-token      — Mint a short-lived QR token
 *   PATCH  /api/v1/passes/:passId/fields        — Manually update field values
 */
export function registerPassRoutes(
  app: FastifyInstance,
  deps: Deps,
  handlers: Handlers,
): void {
  const authPreHandler       = requireAuth(deps.config.SESSION_SECRET);
  const ownerManagerPreHandler = requireAuth(deps.config.SESSION_SECRET, ["owner", "manager"]);

  // POST /api/v1/passes — issue a pass
  app.post("/api/v1/passes", { preHandler: ownerManagerPreHandler }, async (req, reply) => {
    const auth = getAuth(req);
    const body = parse(issuePassBodySchema, req.body);
    const r    = await handlers.issuePass.execute({
      memberId:    body.memberId,
      passTypeId:  body.templateId,
      tenantId:    auth.tenantId,
      fieldValues: body.fieldValues,
    });
    if (!r.ok) throw r.error;
    return reply.status(201).send({ data: r.value });
  });

  // GET /api/v1/passes/:passId/pkpass — download signed .pkpass
  app.get("/api/v1/passes/:passId/pkpass", { preHandler: authPreHandler }, async (req, reply) => {
    const auth   = getAuth(req);
    const params = parse(passIdParamsSchema, req.params);

    const ifModifiedSinceHeader =
      (req.headers as Record<string, string | undefined>)["if-modified-since"];
    const ifModifiedSince = ifModifiedSinceHeader
      ? new Date(ifModifiedSinceHeader)
      : undefined;

    const r = await handlers.getPassPkpass.execute({
      passId:          params.passId,
      tenantId:        auth.tenantId,
      ifModifiedSince,
    });
    if (!r.ok) throw r.error;

    if (r.value.status === 304) {
      return reply.status(304).send();
    }

    return reply
      .status(200)
      .header("Content-Type", "application/vnd.apple.pkpass")
      .header("Content-Disposition", 'attachment; filename="lovalte.pkpass"')
      .header("Last-Modified", r.value.lastModified)
      .send(r.value.buffer);
  });

  // POST /api/v1/passes/:passId/qr-token — mint QR token
  app.post("/api/v1/passes/:passId/qr-token", { preHandler: authPreHandler }, async (req, reply) => {
    const auth   = getAuth(req);
    const params = parse(passIdParamsSchema, req.params);
    const body   = parse(qrTokenBodySchema, req.body ?? {});
    const r      = await handlers.generateQrToken.execute({
      passId:     params.passId,
      tenantId:   auth.tenantId,
      ttlSeconds: body.ttlSeconds,
    });
    if (!r.ok) throw r.error;
    return reply.status(200).send({ data: r.value });
  });

  // PATCH /api/v1/passes/:passId/fields — manual field update (owner/manager)
  app.patch("/api/v1/passes/:passId/fields", { preHandler: ownerManagerPreHandler }, async (req, reply) => {
    const auth   = getAuth(req);
    const params = parse(passIdParamsSchema, req.params);
    const body   = parse(updateFieldsBodySchema, req.body);
    const r      = await handlers.updatePassFields.execute({
      passId:      params.passId,
      tenantId:    auth.tenantId,
      fieldValues: body.fieldValues,
    });
    if (!r.ok) throw r.error;
    return reply.status(200).send({ data: { updated: true } });
  });

  // POST /api/v1/passes/enroll-link — mint a self-enrollment QR link (owner/manager)
  app.post("/api/v1/passes/enroll-link", { preHandler: ownerManagerPreHandler }, async (req, reply) => {
    const auth = getAuth(req);
    const body = parse(enrollLinkBodySchema, req.body);
    const r = await handlers.createEnrollLink.execute({ templateId: body.templateId, tenantId: auth.tenantId });
    if (!r.ok) throw r.error;
    return reply.status(200).send({ data: r.value });
  });

  // POST /api/v1/public/enroll — PUBLIC: a scanned QR creates a unique member + pass
  app.post("/api/v1/public/enroll", async (req, reply) => {
    const body = parse(publicEnrollBodySchema, req.body);
    const r = await handlers.publicEnroll.execute({ token: body.token });
    if (!r.ok) throw r.error;
    return reply.status(201).send({ data: r.value });
  });

  // GET /api/v1/public/passes/:passId/pkpass?t=<downloadToken> — PUBLIC token-gated download
  app.get("/api/v1/public/passes/:passId/pkpass", async (req, reply) => {
    const params = parse(passIdParamsSchema, req.params);
    const query  = parse(downloadQuerySchema, req.query);
    const claims = verifyToken(deps.config.QR_TOKEN_SECRET, query.t, "download");
    if (!claims || claims.passId !== params.passId || !claims.tenantId) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid download link" } });
    }
    const r = await handlers.getPassPkpass.execute({ passId: params.passId, tenantId: claims.tenantId });
    if (!r.ok) throw r.error;
    if (r.value.status === 304) return reply.status(304).send();
    return reply
      .status(200)
      .header("Content-Type", "application/vnd.apple.pkpass")
      .header("Content-Disposition", 'attachment; filename="lovalte.pkpass"')
      .header("Last-Modified", r.value.lastModified)
      .send(r.value.buffer);
  });
}

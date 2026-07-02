import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { IssuePassHandler } from "../application/IssuePassHandler";
import type { GetPassPkpassHandler } from "../application/GetPassPkpassHandler";
import type { UpdatePassFieldsHandler } from "../application/UpdatePassFieldsHandler";
import type { CreateEnrollLinkHandler } from "../application/CreateEnrollLinkHandler";
import type { PublicEnrollHandler } from "../application/PublicEnrollHandler";
import { verifyToken, DOWNLOAD_TOKEN_MAX_AGE_MS } from "../application/enrollTokens";

interface Handlers {
  issuePass: IssuePassHandler;
  getPassPkpass: GetPassPkpassHandler;
  updatePassFields: UpdatePassFieldsHandler;
  createEnrollLink: CreateEnrollLinkHandler;
  publicEnroll: PublicEnrollHandler;
}

const issuePassBodySchema = z
  .object({
    memberId: z.string().uuid(),
    templateId: z.string().uuid(),
    fieldValues: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          value: z.union([z.string(), z.number()]),
          changeMessage: z.string().optional(),
        }),
      )
      .optional(),
  })
  .strict();

const updateFieldsBodySchema = z
  .object({
    fieldValues: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          value: z.union([z.string(), z.number()]),
          changeMessage: z.string().optional(),
        }),
      )
      .min(1),
  })
  .strict();

const passIdParamsSchema = z.object({ passId: z.string().uuid() });
const enrollLinkBodySchema = z.object({ templateId: z.string().uuid() }).strict();
const publicEnrollBodySchema = z.object({ token: z.string().min(8).max(2048) }).strict();
const downloadQuerySchema = z.object({ t: z.string().min(8).max(2048) });

/**
 * Which wallet a scanning device natively supports, from its User-Agent.
 * "apple" = iPhone/iPod/iPad (Camera app scans open Safari with these UAs);
 * "google" = Android; "web" = everything else (desktop, bots, iPads in
 * desktop-mode masquerading as Macintosh) and gets the enroll page fallback.
 * Pure - unit-tested in __tests__/handlers.test.ts.
 */
export function detectWalletPlatform(userAgent: string | undefined): "apple" | "google" | "web" {
  if (!userAgent) return "web";
  if (/iPhone|iPod|iPad/i.test(userAgent)) return "apple";
  if (/Android/i.test(userAgent)) return "google";
  return "web";
}

/**
 * Registers pass-issuance routes under /api/v1/passes.
 *
 * Routes:
 *   POST   /api/v1/passes                      - Issue a new pass (idempotent)
 *   GET    /api/v1/passes/:passId/pkpass        - Download signed .pkpass
 *   PATCH  /api/v1/passes/:passId/fields        - Manually update field values
 */
export function registerPassRoutes(app: FastifyInstance, deps: Deps, handlers: Handlers): void {
  const authPreHandler = requireAuth(deps.config.SESSION_SECRET);
  const ownerManagerPreHandler = requireAuth(deps.config.SESSION_SECRET, ["owner", "manager"]);

  // POST /api/v1/passes - issue a pass
  app.post("/api/v1/passes", { preHandler: ownerManagerPreHandler }, async (req, reply) => {
    const auth = getAuth(req);
    const body = parse(issuePassBodySchema, req.body);
    const r = await handlers.issuePass.execute({
      memberId: body.memberId,
      passTypeId: body.templateId,
      tenantId: auth.tenantId,
      fieldValues: body.fieldValues,
    });
    if (!r.ok) throw r.error;
    return reply.status(201).send({ data: r.value });
  });

  // GET /api/v1/passes/:passId/pkpass - download signed .pkpass
  app.get("/api/v1/passes/:passId/pkpass", { preHandler: authPreHandler }, async (req, reply) => {
    const auth = getAuth(req);
    const params = parse(passIdParamsSchema, req.params);

    const ifModifiedSinceHeader = (req.headers as Record<string, string | undefined>)[
      "if-modified-since"
    ];
    const ifModifiedSince = ifModifiedSinceHeader ? new Date(ifModifiedSinceHeader) : undefined;

    const r = await handlers.getPassPkpass.execute({
      passId: params.passId,
      tenantId: auth.tenantId,
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

  // PATCH /api/v1/passes/:passId/fields - manual field update (owner/manager)
  app.patch(
    "/api/v1/passes/:passId/fields",
    { preHandler: ownerManagerPreHandler },
    async (req, reply) => {
      const auth = getAuth(req);
      const params = parse(passIdParamsSchema, req.params);
      const body = parse(updateFieldsBodySchema, req.body);
      const r = await handlers.updatePassFields.execute({
        passId: params.passId,
        tenantId: auth.tenantId,
        fieldValues: body.fieldValues,
      });
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: { updated: true } });
    },
  );

  // POST /api/v1/passes/enroll-link - mint a self-enrollment QR link (owner/manager)
  app.post(
    "/api/v1/passes/enroll-link",
    { preHandler: ownerManagerPreHandler },
    async (req, reply) => {
      const auth = getAuth(req);
      const body = parse(enrollLinkBodySchema, req.body);
      const r = await handlers.createEnrollLink.execute({
        templateId: body.templateId,
        tenantId: auth.tenantId,
      });
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    },
  );

  // POST /api/v1/public/enroll - PUBLIC: a scanned QR creates a unique member + pass
  app.post("/api/v1/public/enroll", async (req, reply) => {
    const body = parse(publicEnrollBodySchema, req.body);
    const r = await handlers.publicEnroll.execute({ token: body.token });
    if (!r.ok) throw r.error;
    return reply.status(201).send({ data: r.value });
  });

  /**
   * GET /api/v1/public/enroll?t=<enrollToken> - PUBLIC: the one printed QR.
   * Branches on the scanner's platform so each phone gets its NATIVE add flow
   * with zero web-page hop:
   *   iPhone/iPad  -> enroll + stream the .pkpass (Safari shows the Add Pass sheet)
   *   Android      -> enroll + 302 to the pay.google.com save URL (native add screen)
   *   anything else-> 302 to the enroll web page (both buttons; also the fallback
   *                   when Google Wallet isn't configured)
   * The enroll token rides in the query (the server must see it to act), unlike
   * the page URL's fragment - it's a mint-only capability, acceptable in logs.
   */
  app.get("/api/v1/public/enroll", async (req, reply) => {
    const query = parse(downloadQuerySchema, req.query);
    const platform = detectWalletPlatform(req.headers["user-agent"]);
    const pageUrl = `${deps.config.APP_BASE_URL}/enroll#${query.t}`;

    if (platform === "web") return reply.redirect(pageUrl, 302);
    // Android with Google Wallet unconfigured -> page (before issuing anything,
    // so the fallback never strands an orphan pass).
    if (platform === "google" && !deps.services.googleWalletSaveUrl) {
      return reply.redirect(pageUrl, 302);
    }

    const enrolled = await handlers.publicEnroll.execute({ token: query.t });
    if (!enrolled.ok) throw enrolled.error;
    const { passId, downloadToken } = enrolled.value;
    // tenantId comes from the signed download token we just minted, never the client.
    const claims = verifyToken(deps.config.QR_TOKEN_SECRET, downloadToken, "download");
    if (!claims?.tenantId) throw new Error("download token minted without tenantId");

    if (platform === "google") {
      const saveUrl = await deps.services.googleWalletSaveUrl?.(passId, claims.tenantId);
      return reply.redirect(saveUrl ?? pageUrl, 302);
    }

    // Apple: serve the freshly issued pass directly - Safari hands bytes with
    // this content type straight to Wallet's full-screen Add Pass sheet.
    const r = await handlers.getPassPkpass.execute({ passId, tenantId: claims.tenantId });
    if (!r.ok) throw r.error;
    if (r.value.status !== 200) return reply.redirect(pageUrl, 302);
    return reply
      .status(200)
      .header("Content-Type", "application/vnd.apple.pkpass")
      .header("Content-Disposition", 'attachment; filename="lovalte.pkpass"')
      .header("Last-Modified", r.value.lastModified)
      .send(r.value.buffer);
  });

  // GET /api/v1/public/passes/:passId/pkpass?t=<downloadToken> - PUBLIC token-gated download
  app.get("/api/v1/public/passes/:passId/pkpass", async (req, reply) => {
    const params = parse(passIdParamsSchema, req.params);
    const query = parse(downloadQuerySchema, req.query);
    const claims = verifyToken(
      deps.config.QR_TOKEN_SECRET,
      query.t,
      "download",
      DOWNLOAD_TOKEN_MAX_AGE_MS,
    );
    if (!claims || claims.passId !== params.passId || !claims.tenantId) {
      return reply
        .status(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Invalid download link" } });
    }
    const r = await handlers.getPassPkpass.execute({
      passId: params.passId,
      tenantId: claims.tenantId,
    });
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

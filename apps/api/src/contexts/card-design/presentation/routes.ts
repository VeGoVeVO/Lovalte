import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { CreateCardTemplateHandler } from "../application/CreateCardTemplateHandler";
import type { UpdateCardTemplateHandler } from "../application/UpdateCardTemplateHandler";
import type { PublishCardTemplateHandler } from "../application/PublishCardTemplateHandler";
import type { GetCardTemplateHandler } from "../application/GetCardTemplateHandler";
import type { ListCardTemplatesHandler } from "../application/ListCardTemplatesHandler";
import type { RegisterAssetRefHandler } from "../application/RegisterAssetRefHandler";
import type { StoreImageHandler } from "../application/StoreImageHandler";
import type { GetImageHandler } from "../application/GetImageHandler";
import type { DeleteCardTemplateHandler } from "../application/DeleteCardTemplateHandler";

const rgbPattern = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/;

const fieldDefSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  valueTemplate: z.string().min(1),
  numberStyle: z.string().optional(),
  // Apple substitutes %@ with the field's new value in the lockscreen banner;
  // a changeMessage without it is invalid per the PassKit format reference.
  changeMessage: z
    .string()
    .max(200)
    .refine((s) => s.includes("%@"), 'changeMessage must contain "%@" (replaced with the new value)')
    .optional(),
});

// Builder round-trip state for a crop-sourced image (see BrandConfig.CropSource).
const cropSourceSchema = z.object({
  ref: z.string().min(1).max(2048),
  tx: z.number(),
  ty: z.number(),
  scale: z.number(),
});

const templateBodySchema = z
  .object({
    name: z.string().min(1).max(100),
    organizationName: z.string().min(1).max(64),
    logoText: z.string().max(24).optional(),
    backgroundColor: z.string().regex(rgbPattern, "Must be rgb(r, g, b) format"),
    foregroundColor: z.string().regex(rgbPattern, "Must be rgb(r, g, b) format"),
    labelColor: z.string().regex(rgbPattern, "Must be rgb(r, g, b) format").optional(),
    headerFields: z.array(fieldDefSchema).max(3).default([]),
    primaryFields: z.array(fieldDefSchema).max(1).default([]),
    secondaryFields: z.array(fieldDefSchema).max(4).default([]),
    auxiliaryFields: z.array(fieldDefSchema).max(4).default([]),
    backFields: z.array(fieldDefSchema).max(20).default([]),
    pointsPerVisit: z.number().int().min(1),
    rewardThreshold: z.number().int().min(1),
    cardType: z.enum(["points", "stamps", "cashback"]).optional(),
    stampIcon: z.string().max(64).optional(),
    stampedRef: z.string().max(256).optional(),
    unstampedRef: z.string().max(256).optional(),
    // One pre-rendered strip per stamps-earned count (index 0..goal). Cap at 31
    // (max goal 30 + the empty frame) to bound payload size.
    stampStripRefs: z.array(z.string().max(256)).max(31).optional(),
    // Builder round-trip only: original image + crop transform for re-editing.
    // Not consumed by publish validation or pass-issuance.
    heroSource: cropSourceSchema.optional(),
    logoSource: cropSourceSchema.optional(),
    tierRules: z
      .array(z.object({ label: z.string().min(1), minPoints: z.number().int().min(0) }))
      .default([]),
    googleOverrides: z.object({
      bg: z.string().optional(),
      cardTitle: z.string().optional(),
      header: z.string().optional(),
      logoSrc: z.string().optional(),
      heroSrc: z.string().optional(),
      textModules: z.array(z.object({ id: z.string(), header: z.string(), body: z.string() })).optional(),
    }).optional(),
  })
  // storeCard renders secondary + auxiliary from one shared 4-slot pool.
  .refine(
    (b) => (b.secondaryFields?.length ?? 0) + (b.auxiliaryFields?.length ?? 0) <= 4,
    (b) => ({
      message: "secondaryFields + auxiliaryFields must be ≤4 (Apple storeCard field pool)",
      path: [
        (b.auxiliaryFields?.length ?? 0) > (b.secondaryFields?.length ?? 0)
          ? "auxiliaryFields"
          : "secondaryFields",
      ],
    }),
  );

const idParamSchema = z.object({ id: z.string().uuid() });

const assetBodySchema = z.object({
  kind: z.enum(["icon", "logo", "strip"]),
  ref: z.string().min(1).max(2048),
});

const listQuerySchema = z.object({
  status: z.enum(["draft", "published"]).optional(),
});

// 3 MB of base64 (~2 MB decoded, the domain cap). The route bodyLimit below
// keeps the rest of the API at the default 1 MB.
const IMAGE_ROUTE_BODY_LIMIT = 3 * 1024 * 1024;

const imageUploadSchema = z.object({
  kind: z.enum(["icon", "logo", "strip", "generic"]).default("generic"),
  source: z.enum(["upload", "lucide"]).default("upload"),
  // RFC 2397 data URL, e.g. "data:image/png;base64,iVBORw0KGgo..."
  dataUrl: z.string().min(1).max(IMAGE_ROUTE_BODY_LIMIT),
});

/** Parse a base64 data URL into a MIME type + raw bytes. Throws ZodError-shaped 400s upstream. */
function parseDataUrl(dataUrl: string): { contentType: string; bytes: Buffer } {
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) {
    throw Object.assign(new Error("Expected a base64 data URL"), {
      statusCode: 400,
      code: "VALIDATION",
    });
  }
  return { contentType: m[1].toLowerCase(), bytes: Buffer.from(m[2], "base64") };
}

const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export interface CardDesignHandlers {
  create: CreateCardTemplateHandler;
  update: UpdateCardTemplateHandler;
  publish: PublishCardTemplateHandler;
  get: GetCardTemplateHandler;
  list: ListCardTemplatesHandler;
  registerAsset: RegisterAssetRefHandler;
  storeImage: StoreImageHandler;
  getImage: GetImageHandler;
  deleteTemplate: DeleteCardTemplateHandler;
}

export function registerCardDesignRoutes(
  app: FastifyInstance,
  deps: Deps,
  h: CardDesignHandlers,
): void {
  const ownerManager = requireAuth(deps.config.SESSION_SECRET, ["owner", "manager"]);

  /** POST /api/v1/card-templates - create a new draft template */
  app.post("/api/v1/card-templates", { preHandler: ownerManager }, async (req, reply) => {
    const auth = getAuth(req);
    const body = parse(templateBodySchema, req.body);
    const r = await h.create.execute({
      tenantId: auth.tenantId,
      name: body.name,
      organizationName: body.organizationName,
      logoText: body.logoText,
      backgroundColor: body.backgroundColor,
      foregroundColor: body.foregroundColor,
      labelColor: body.labelColor,
      headerFields: body.headerFields ?? [],
      primaryFields: body.primaryFields ?? [],
      secondaryFields: body.secondaryFields ?? [],
      auxiliaryFields: body.auxiliaryFields ?? [],
      backFields: body.backFields ?? [],
      pointsPerVisit: body.pointsPerVisit,
      rewardThreshold: body.rewardThreshold,
      cardType: body.cardType,
      stampIcon: body.stampIcon,
      stampedRef: body.stampedRef,
      unstampedRef: body.unstampedRef,
      stampStripRefs: body.stampStripRefs,
      heroSource: body.heroSource,
      logoSource: body.logoSource,
      tierRules: body.tierRules ?? [],
      googleOverrides: body.googleOverrides,
    });
    if (!r.ok) throw r.error;
    return reply.status(201).send(r.value);
  });

  /** GET /api/v1/card-templates - list templates for the authenticated tenant */
  app.get("/api/v1/card-templates", { preHandler: ownerManager }, async (req, reply) => {
    const auth = getAuth(req);
    const query = parse(listQuerySchema, req.query);
    const r = await h.list.execute({ tenantId: auth.tenantId, status: query.status });
    if (!r.ok) throw r.error;
    return reply.status(200).send(r.value);
  });

  /** GET /api/v1/card-templates/:id - fetch a single template */
  app.get("/api/v1/card-templates/:id", { preHandler: ownerManager }, async (req, reply) => {
    const auth = getAuth(req);
    const { id } = parse(idParamSchema, req.params);
    const r = await h.get.execute({ templateId: id, tenantId: auth.tenantId });
    if (!r.ok) throw r.error;
    return reply.status(200).send(r.value);
  });

  /** PUT /api/v1/card-templates/:id - update a draft template's brand/reward config */
  app.put("/api/v1/card-templates/:id", { preHandler: ownerManager }, async (req, reply) => {
    const auth = getAuth(req);
    const { id } = parse(idParamSchema, req.params);
    const body = parse(templateBodySchema, req.body);
    const r = await h.update.execute({
      templateId: id,
      tenantId: auth.tenantId,
      name: body.name,
      organizationName: body.organizationName,
      logoText: body.logoText,
      backgroundColor: body.backgroundColor,
      foregroundColor: body.foregroundColor,
      labelColor: body.labelColor,
      headerFields: body.headerFields ?? [],
      primaryFields: body.primaryFields ?? [],
      secondaryFields: body.secondaryFields ?? [],
      auxiliaryFields: body.auxiliaryFields ?? [],
      backFields: body.backFields ?? [],
      pointsPerVisit: body.pointsPerVisit,
      rewardThreshold: body.rewardThreshold,
      cardType: body.cardType,
      stampIcon: body.stampIcon,
      stampedRef: body.stampedRef,
      unstampedRef: body.unstampedRef,
      stampStripRefs: body.stampStripRefs,
      heroSource: body.heroSource,
      logoSource: body.logoSource,
      tierRules: body.tierRules ?? [],
      googleOverrides: body.googleOverrides,
    });
    if (!r.ok) throw r.error;
    return reply.status(200).send(r.value);
  });

  /** POST /api/v1/card-templates/:id/publish - publish a draft template */
  app.post(
    "/api/v1/card-templates/:id/publish",
    { preHandler: ownerManager },
    async (req, reply) => {
      const auth = getAuth(req);
      const { id } = parse(idParamSchema, req.params);
      const r = await h.publish.execute({ templateId: id, tenantId: auth.tenantId });
      if (!r.ok) throw r.error;
      return reply.status(200).send(r.value);
    },
  );

  /**
   * POST /api/v1/card-templates/:id/assets
   * Register a previously-uploaded asset ref (icon, logo, strip).
   * The actual S3 upload is performed by the client; this stores the key/URL.
   */
  app.post(
    "/api/v1/card-templates/:id/assets",
    { preHandler: ownerManager },
    async (req, reply) => {
      const auth = getAuth(req);
      const { id } = parse(idParamSchema, req.params);
      const body = parse(assetBodySchema, req.body);
      const r = await h.registerAsset.execute({
        templateId: id,
        tenantId: auth.tenantId,
        kind: body.kind,
        ref: body.ref,
      });
      if (!r.ok) throw r.error;
      return reply.status(201).send(r.value);
    },
  );

  /**
   * POST /api/v1/images - store a card image (uploaded file or rasterised Lucide
   * icon) IN the database and return its public ref. Body is a base64 data URL.
   * Larger bodyLimit than the rest of the API; bytes are validated + magic-byte
   * checked in the domain before persisting.
   */
  app.post(
    "/api/v1/images",
    { preHandler: ownerManager, bodyLimit: IMAGE_ROUTE_BODY_LIMIT },
    async (req, reply) => {
      const auth = getAuth(req);
      const body = parse(imageUploadSchema, req.body);
      const { contentType, bytes } = parseDataUrl(body.dataUrl);
      const r = await h.storeImage.execute({
        tenantId: auth.tenantId,
        kind: body.kind ?? "generic",
        contentType,
        bytes,
        source: body.source ?? "upload",
      });
      if (!r.ok) throw r.error;
      return reply.status(201).send(r.value);
    },
  );

  /**
   * DELETE /api/v1/card-templates/:id - permanently delete a card design (any
   * status). Passes already issued from it keep working (independent snapshot);
   * only new issuance from this design stops.
   */
  app.delete("/api/v1/card-templates/:id", { preHandler: ownerManager }, async (req, reply) => {
    const auth = getAuth(req);
    const { id } = parse(idParamSchema, req.params);
    const r = await h.deleteTemplate.execute({ templateId: id, tenantId: auth.tenantId });
    if (!r.ok) throw r.error;
    return reply.status(204).send();
  });

  /**
   * GET /api/v1/images/:id - public, unauthenticated serve of stored card art by
   * unguessable UUID (devices/Apple Wallet fetch with no session). Hardened:
   * nosniff + immutable cache; SVG is sandboxed via CSP to neutralise scripts.
   */
  app.get("/api/v1/images/:id", async (req, reply) => {
    const { id } = parse(idParamSchema, req.params);
    const r = await h.getImage.execute(id);
    if (!r.ok) throw r.error;
    reply
      .header("Content-Type", r.value.contentType)
      .header("Content-Length", r.value.byteSize)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Disposition", "inline");
    if (r.value.contentType === "image/svg+xml") {
      reply.header("Content-Security-Policy", SVG_CSP);
    }
    return reply.status(200).send(r.value.bytes);
  });
}

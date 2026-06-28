import type { ContextModule } from "../../http/app";
import type { PassTemplateDto, FieldDefinition } from "./domain/ports";
import { IssuePassHandler } from "./application/IssuePassHandler";
import { GetPassPkpassHandler } from "./application/GetPassPkpassHandler";
import { GenerateQrTokenHandler } from "./application/GenerateQrTokenHandler";
import { UpdatePassFieldsHandler, applyEarnedPoints } from "./application/UpdatePassFieldsHandler";
import { SqlPassRepository } from "./infrastructure/SqlPassRepository";
import { SqlPassTemplateRepository } from "./infrastructure/SqlPassTemplateRepository";
import { PassKitSigningAdapter } from "./infrastructure/PassKitSigningAdapter";
import { RedisPassBufferCache } from "./infrastructure/RedisPassBufferCache";
import { CreateEnrollLinkHandler } from "./application/CreateEnrollLinkHandler";
import { PublicEnrollHandler } from "./application/PublicEnrollHandler";
import { registerPassRoutes } from "./presentation/routes";

// Deprecated-card design applied to every pass when its template is deleted: a
// neutral Lovalte snapshot plus a "no longer valid" message (Spanish, the
// product locale). The existing icon in the snapshot is kept so the pass stays
// Apple-valid; voiding greys it out in Wallet.
const DEPRECATED_FIELD_DEFS: FieldDefinition[] = [
  { key: "estado", label: "Estado", region: "primary" },
  { key: "aviso", label: "Aviso", region: "back" },
];
const DEPRECATION_VALUES = [
  { key: "estado", label: "Estado", value: "No válida" },
  {
    key: "aviso",
    label: "Aviso",
    value: "Esta tarjeta de fidelidad ya no está activa. Puedes eliminarla de tu Apple Wallet.",
  },
];

/**
 * Pass-Issuance bounded context.
 *
 * Responsibilities:
 *  - Issue signed Apple Wallet passes (.pkpass) for members.
 *  - Cache and serve pkpass buffers.
 *  - Generate QR tokens for scanning (single-use nonces stored in Redis).
 *  - React to cross-context events: CardTemplatePublished, PointsEarned.
 */
export const registerPassIssuance: ContextModule = async (app, deps) => {
  // ── Infrastructure ───────────────────────────────────────────────────────
  const passRepo = new SqlPassRepository(deps.pool);
  const templateRepo = new SqlPassTemplateRepository(deps.pool);
  const signer = new PassKitSigningAdapter(deps.config, deps.pool);
  const bufferCache = new RedisPassBufferCache(deps.redis);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const issuePass = new IssuePassHandler(
    passRepo,
    templateRepo,
    signer,
    bufferCache,
    deps.clock,
    deps.bus,
  );
  const getPassPkpass = new GetPassPkpassHandler(passRepo, templateRepo, signer, bufferCache);
  const generateQrToken = new GenerateQrTokenHandler(passRepo, deps.redis, deps.config);
  const updatePassFields = new UpdatePassFieldsHandler(passRepo, deps.bus, deps.clock);
  const createEnrollLink = new CreateEnrollLinkHandler(templateRepo, deps.config, deps.clock);
  const publicEnroll = new PublicEnrollHandler(issuePass, deps.config, deps.clock);

  // ── Cross-context event subscriptions ────────────────────────────────────

  /**
   * CardTemplatePublished - snapshot the template data into pass_types so this
   * context can issue passes without importing the card-design domain.
   *
   * Expected payload: { templateId, tenantId, passTypeIdentifier, teamIdentifier,
   *   organizationName, description, logoText?, backgroundColor, foregroundColor,
   *   labelColor?, webServiceUrl, fieldDefinitions[], imageAssetRefs }
   */
  deps.bus.subscribe("CardTemplatePublished", async (event) => {
    const p = event.payload as Record<string, unknown>;
    const templateId = p.templateId as string;
    const tenantId = p.tenantId as string;

    // Read the published template snapshot (cross-context read, by ID only - the
    // event carries IDs; brand/fields live in card_templates.config). Apple-level
    // identifiers (passType/team/webService) are infra config, never card-design data.
    const tpl = await deps.pool.query<{ name: string; config: Record<string, unknown> }>(
      `SELECT name, config FROM card_templates WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId],
    );
    const row = tpl.rows[0];
    const brand = (row?.config?.brand ?? {}) as Record<string, unknown>;
    const orgName = (brand.organizationName as string) ?? row?.name ?? "Lovalte";

    // Snapshot each brand field WITH its Apple pass region. PassDocumentBuilder
    // drops any field whose region is undefined, which is why the points field
    // was missing from issued passes (brand.*Fields carry no region).
    const mapRegion = (arr: unknown, region: FieldDefinition["region"]): FieldDefinition[] =>
      (Array.isArray(arr) ? arr : []).map((f) => {
        const o = f as { key: string; label: string };
        return { key: o.key, label: o.label, region };
      });

    const dto: PassTemplateDto = {
      id: templateId,
      tenantId,
      passTypeIdentifier: deps.config.APPLE_PASS_TYPE_ID ?? "pass.com.lovalte.loyalty",
      teamIdentifier: deps.config.APPLE_TEAM_ID ?? "",
      organizationName: orgName,
      description: (p.description as string) ?? `${orgName} loyalty card`,
      logoText: brand.logoText as string | undefined,
      backgroundColor: (brand.backgroundColor as string) ?? "rgb(30,40,60)",
      foregroundColor: (brand.foregroundColor as string) ?? "rgb(255,255,255)",
      labelColor: brand.labelColor as string | undefined,
      // Strip any trailing slash: Apple appends "/v1/..." to webServiceURL, so a
      // trailing slash yields ".../wallet//v1/..." (double slash) which 404s and
      // breaks device registration -> no APNs push -> the card never updates.
      webServiceUrl: deps.config.WALLET_WEB_SERVICE_URL.replace(/\/+$/, ""),
      fieldDefinitions: [
        ...mapRegion(brand.headerFields, "header"),
        ...mapRegion(brand.primaryFields, "primary"),
        ...mapRegion(brand.secondaryFields, "secondary"),
        ...mapRegion(brand.auxiliaryFields, "auxiliary"),
      ],
      imageAssetRefs: {
        icon: (brand.iconRef as string) ?? "",
        logo: (brand.logoRef as string) ?? "",
        strip: (brand.stripRef as string) ?? "",
      },
    };
    await templateRepo.upsert(dto);
  });

  /**
   * PointsEarned - update the points/tier field values on the member's pass.
   * The bump to lastUpdated triggers PassFieldsUpdated, which the Delivery context
   * uses to send an APNs empty push, prompting the device to poll for the new version.
   *
   * Expected payload: { memberId, tenantId, newBalance, newTier? }
   */
  deps.bus.subscribe("PointsEarned", async (event) => {
    const p = event.payload as Record<string, unknown>;
    const memberId = p.memberId as string;
    const tenantId = p.tenantId as string;
    const newBalance = p.newBalance as number;
    const newTier = p.newTier as string | undefined;

    // Resolve the exact pass by passId (the reliable pass<->member link). The
    // pass's member_id is the enrollment UUID, which differs from the membership
    // member id, so findByMemberId would not match. Fall back to it only for
    // legacy events emitted before passId was added.
    const passId = p.passId as string | undefined;
    const passes = passId
      ? [await passRepo.findById(passId, tenantId)].filter(
          (x): x is NonNullable<typeof x> => x !== null,
        )
      : await passRepo.findByMemberId(memberId, tenantId);
    for (const pass of passes) {
      if (pass.voided) continue;
      const updated = applyEarnedPoints(pass.fieldValues, newBalance, newTier);
      const r = await updatePassFields.execute({
        passId: pass.id.value,
        tenantId,
        fieldValues: updated,
      });
      if (!r.ok) {
        app.log.error({ err: r.error }, "UpdatePassFields failed after PointsEarned");
        continue;
      }
      // Eagerly re-sign + cache the NEW pass version so the Wallet web service
      // (delivery getpass) can serve it the moment the device polls after the
      // APNs push. Without this the new version is never in Redis -> getpass
      // 503s -> the card visually never refreshes.
      const signed = await getPassPkpass.execute({ passId: pass.id.value, tenantId });
      if (!signed.ok) {
        app.log.error({ err: signed.error }, "Re-sign after PointsEarned failed");
      }
    }
  });

  /**
   * CardTemplateDeleted - the merchant deleted a card design. Deactivate every
   * pass issued from it: rebrand the (independent) pass_types snapshot to a
   * neutral Lovalte "no longer valid" design, then write a deprecation message +
   * void each pass so it greys out in the customer's Wallet and stops earning.
   * Passes have no FK to card_templates, so the snapshot + passes survive the
   * row deletion and can be rewritten here.
   *
   * Expected payload: { templateId, tenantId }
   */
  deps.bus.subscribe("CardTemplateDeleted", async (event) => {
    const p = event.payload as Record<string, unknown>;
    const templateId = p.templateId as string;
    const tenantId = p.tenantId as string;

    const snap = await templateRepo.findById(templateId, tenantId);
    if (snap) {
      await templateRepo.upsert({
        ...snap,
        organizationName: "Lovalte",
        logoText: "Lovalte",
        description: "Tarjeta de fidelidad no válida",
        backgroundColor: "rgb(40, 44, 52)",
        foregroundColor: "rgb(255, 255, 255)",
        labelColor: "rgb(170, 176, 190)",
        fieldDefinitions: DEPRECATED_FIELD_DEFS,
        // keep imageAssetRefs: the existing icon survives and keeps the pass Apple-valid
      });
    }

    const passes = await passRepo.findByPassTypeId(templateId, tenantId);
    for (const pass of passes) {
      if (pass.voided) continue;
      pass.updateFields(DEPRECATION_VALUES, deps.clock.now()); // emits PassFieldsUpdated -> APNs push
      pass.voidPass(deps.clock.now()); // greys the pass out in Wallet
      await passRepo.save(pass);
      await deps.bus.publish(pass.pullEvents());
      // Eagerly re-sign + cache so the device gets the deprecated pass on poll.
      const signed = await getPassPkpass.execute({ passId: pass.id.value, tenantId });
      if (!signed.ok) {
        app.log.error({ err: signed.error }, "Re-sign after CardTemplateDeleted failed");
      }
    }
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  registerPassRoutes(app, deps, {
    issuePass,
    getPassPkpass,
    generateQrToken,
    updatePassFields,
    createEnrollLink,
    publicEnroll,
  });
};

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

// Branded deprecation card shown to holders when a merchant deletes a template.
// Styled as a polished Lovalte card (deep navy, white text) so it looks intentional,
// and includes a friendly Spanish promo nudging the holder to create their own cards.
// The existing icon in the snapshot is kept so the pass stays Apple-valid; voiding
// greys it out in Wallet automatically.
const DEPRECATED_FIELD_DEFS: FieldDefinition[] = [
  { key: "estado", label: "Estado", region: "primary" },
  { key: "lovalte", label: "Lovalte", region: "back" },
];
/** Flatten a stamp card's per-count strip frames into `strip_<n>` asset keys. */
function stampStripEntries(refs: unknown): Record<string, string> {
  if (!Array.isArray(refs)) return {};
  const out: Record<string, string> = {};
  refs.forEach((ref, i) => {
    if (typeof ref === "string" && ref) out[`strip_${i}`] = ref;
  });
  return out;
}

const DEPRECATION_VALUES = [
  { key: "estado", label: "Estado", value: "Tarjeta archivada" },
  {
    key: "lovalte",
    label: "Lovalte",
    value:
      "Esta tarjeta ya no está activa. Crea las tuyas y descubre la fidelidad en Apple Wallet en lovalte.com",
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
    const rewardRule = (row?.config?.rewardRule ?? {}) as Record<string, unknown>;
    // Google Wallet has its own logo/hero (the genericObject.logo / heroImage). They
    // live in config.googleOverrides, separate from the Apple brand refs.
    const googleOv = (row?.config?.googleOverrides ?? {}) as Record<string, unknown>;
    const orgName = (brand.organizationName as string) ?? row?.name ?? "Lovalte";
    // Loyalty mechanic drives how the primary value is formatted on the pass.
    const loyaltyType =
      (rewardRule.cardType as "points" | "stamps" | "cashback" | undefined) ?? "points";
    const loyaltyGoal = Number(rewardRule.rewardThreshold) || 10;

    // Snapshot each brand field WITH its Apple pass region. PassDocumentBuilder
    // drops any field whose region is undefined, which is why the points field
    // was missing from issued passes (brand.*Fields carry no region).
    const mapRegion = (arr: unknown, region: FieldDefinition["region"]): FieldDefinition[] =>
      (Array.isArray(arr) ? arr : []).map((f) => {
        const o = f as { key: string; label: string; valueTemplate?: string };
        // Carry the merchant's typed value so header/secondary/back fields render
        // their VALUE on the pass (not just the label).
        return { key: o.key, label: o.label, region, value: o.valueTemplate };
      });
    // The loyalty counter (key "points") is formatted "X / N" by PassDocumentBuilder
    // wherever it sits: primary (points/cashback) or secondary (stamps — the count
    // shows below the strip). Tag it by KEY so the formatting follows the field.
    const tagLoyalty = (d: FieldDefinition): FieldDefinition =>
      d.key === "points" ? { ...d, loyaltyType, loyaltyGoal } : d;

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
        ...mapRegion(brand.primaryFields, "primary").map(tagLoyalty),
        ...mapRegion(brand.secondaryFields, "secondary").map(tagLoyalty),
        ...mapRegion(brand.auxiliaryFields, "auxiliary"),
      ],
      imageAssetRefs: {
        icon: (brand.iconRef as string) ?? "",
        logo: (brand.logoRef as string) ?? "",
        strip: (brand.stripRef as string) ?? "",
        // Google's own logo/hero. Prefer the Google override, fall back to the Apple
        // logo/strip so the Google card still gets an image. Kept under separate keys
        // so they never clobber the Apple refs (which a shared key used to do).
        googleLogo: (googleOv.logoSrc as string) || (brand.logoRef as string) || "",
        googleStrip: (googleOv.heroSrc as string) || (brand.stripRef as string) || "",
        // Stamp cards carry one pre-rendered strip per earned-count, baked in the
        // browser at publish. Flatten them as strip_<n>; GetPassPkpassHandler picks
        // strip_<earned> at sign time so the grid matches the customer's progress.
        ...stampStripEntries(brand.stampStripRefs),
      },
    };
    await templateRepo.upsert(dto);

    // Push the updated design to all existing non-voided passes so holders see
    // the new card immediately. We do NOT change field values — we pass the
    // pass's own existing fieldValues back through UpdatePassFieldsHandler,
    // which bumps lastUpdated + version and emits PassFieldsUpdated. The delivery
    // context converts that event into an APNs empty push so the device polls and
    // picks up the newly re-signed pkpass.
    const existingPasses = await passRepo.findByPassTypeId(templateId, tenantId);
    for (const pass of existingPasses) {
      if (pass.voided) continue;
      try {
        const r = await updatePassFields.execute({
          passId: pass.id.value,
          tenantId,
          fieldValues: pass.fieldValues,
        });
        if (!r.ok) {
          app.log.error({ err: r.error }, "UpdatePassFields failed after CardTemplatePublished");
          continue;
        }
        const signed = await getPassPkpass.execute({ passId: pass.id.value, tenantId });
        if (!signed.ok) {
          app.log.error({ err: signed.error }, "Re-sign after CardTemplatePublished failed");
        }
      } catch (passErr) {
        app.log.error(
          { err: passErr, passId: pass.id.value },
          "Pass refresh failed after CardTemplatePublished",
        );
      }
    }
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
        description: "Tarjeta archivada — Lovalte",
        // Deep Lovalte navy background with white foreground and muted-grey labels
        // for a polished branded look that signals intentional deactivation.
        backgroundColor: "rgb(20, 22, 38)",
        foregroundColor: "rgb(255, 255, 255)",
        labelColor: "rgb(160, 165, 185)",
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

  /**
   * TenantDeleted - hard-delete all pass-issuance data for the tenant.
   * Passes are deleted first (FK references pass_types), then pass_types.
   *
   * Expected payload: { tenantId: string }
   */
  deps.bus.subscribe("TenantDeleted", async (event) => {
    await passRepo.purgeByTenant(String((event.payload as Record<string, unknown>).tenantId));
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

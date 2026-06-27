import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { DomainError } from "../../../kernel";
import type { AppConfig } from "../../../config/env";
import type { IPassSigningPort } from "../domain/ports";

const IMAGE_REF_RE = /\/api\/v1\/images\/([0-9a-fA-F-]{36})/;

/**
 * PassKitSigningAdapter — implements IPassSigningPort with passkit-generator v3.5.7.
 *
 * Builds a real .pkpass bundle: a `pass.json` buffer (so passkit detects the
 * storeCard type + validates), Apple-named image buffers, signed with the
 * configured Apple certs. Images are resolved from the card-image DB when the
 * ref is a `/api/v1/images/:id` URL (the builder stores card art there), or from
 * the filesystem otherwise.
 *
 * ponytail: cross-context read of `card_images` by id mirrors the existing
 * cross-context read of `card_templates`; a dedicated media service / event
 * snapshot would decouple it further if pass-issuance ever splits out.
 */
export class PassKitSigningAdapter implements IPassSigningPort {
  constructor(
    private readonly config: AppConfig,
    private readonly pool: Pool,
  ) {}

  async sign(
    passJson: Record<string, unknown>,
    imageAssetRefs: Record<string, string>,
  ): Promise<Buffer> {
    const {
      APPLE_SIGNER_CERT_PATH,
      APPLE_SIGNER_KEY_PATH,
      APPLE_WWDR_PATH,
      APPLE_SIGNER_KEY_PASSPHRASE,
    } = this.config;

    if (!APPLE_SIGNER_CERT_PATH || !APPLE_SIGNER_KEY_PATH || !APPLE_WWDR_PATH) {
      throw new DomainError(
        "Pass signing not configured",
        "DOMAIN_ERROR",
        "Set APPLE_SIGNER_CERT_PATH, APPLE_SIGNER_KEY_PATH, and APPLE_WWDR_PATH",
      );
    }

    const { PKPass } = await import("passkit-generator");

    const [signerCert, signerKey, wwdr] = await Promise.all([
      readFile(APPLE_SIGNER_CERT_PATH),
      readFile(APPLE_SIGNER_KEY_PATH),
      readFile(APPLE_WWDR_PATH),
    ]);

    // teamIdentifier + passTypeIdentifier are Apple-account infra config, not
    // card-design data. Always stamp the CURRENT configured values so a template
    // published before the team id was set (stale pass_types snapshot with an
    // empty teamIdentifier) can't produce an invalid pass.json.
    if (this.config.APPLE_TEAM_ID) passJson.teamIdentifier = this.config.APPLE_TEAM_ID;
    if (this.config.APPLE_PASS_TYPE_ID) passJson.passTypeIdentifier = this.config.APPLE_PASS_TYPE_ID;

    // ── Assemble the bundle ───────────────────────────────────────────────
    const buffers: Record<string, Buffer> = {
      "pass.json": Buffer.from(JSON.stringify(passJson)),
    };

    // Apple requires icon.png; provide @2x/@3x from the same source for Retina.
    const icon = await this.resolveImage(imageAssetRefs.icon);
    if (!icon) {
      throw new DomainError(
        "This card has no icon image. Add one in the card builder before issuing passes.",
        "DOMAIN_ERROR",
      );
    }
    buffers["icon.png"] = icon;
    buffers["icon@2x.png"] = icon;
    buffers["icon@3x.png"] = icon;

    const logo = await this.resolveImage(imageAssetRefs.logo);
    if (logo) {
      buffers["logo.png"] = logo;
      buffers["logo@2x.png"] = logo;
    }
    const strip = await this.resolveImage(imageAssetRefs.strip);
    if (strip) {
      buffers["strip.png"] = strip;
      buffers["strip@2x.png"] = strip;
    }

    // passkit-generator rejects an empty-string passphrase; an unencrypted signer
    // key must omit it entirely. Only pass it when a real passphrase is set.
    const pkpass = new PKPass(buffers, {
      signerCert,
      signerKey,
      wwdr,
      ...(APPLE_SIGNER_KEY_PASSPHRASE
        ? { signerKeyPassphrase: APPLE_SIGNER_KEY_PASSPHRASE }
        : {}),
    });

    return pkpass.getAsBuffer();
  }

  /** Resolve an asset ref to bytes: card_images DB row for /api/v1/images/:id, else a file path. */
  private async resolveImage(ref?: string): Promise<Buffer | null> {
    if (!ref) return null;
    const m = IMAGE_REF_RE.exec(ref);
    if (m) {
      const res = await this.pool.query<{ bytes: Buffer }>(
        "SELECT bytes FROM card_images WHERE id = $1",
        [m[1]],
      );
      return res.rows[0]?.bytes ?? null;
    }
    try {
      return await readFile(ref);
    } catch {
      return null;
    }
  }
}

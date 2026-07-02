import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { Pool } from "pg";
import { DomainError } from "../../../kernel";
import type { AppConfig } from "../../../config/env";
import type { IPassSigningPort } from "../domain/ports";

const IMAGE_REF_RE = /\/api\/v1\/images\/([0-9a-fA-F-]{36})/;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPngBuffer(b: Buffer): boolean {
  return b.length >= 8 && b.subarray(0, 8).equals(PNG_MAGIC);
}

function log(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/**
 * PassKitSigningAdapter - implements IPassSigningPort with passkit-generator v3.5.7.
 *
 * Builds a real .pkpass bundle: a `pass.json` buffer (so passkit detects the
 * storeCard type + validates), Apple-named image buffers, signed with the
 * configured Apple certs. Images are resolved from the card-image DB when the
 * ref is a `/api/v1/images/:id` URL (the builder stores card art there), or from
 * the filesystem otherwise.
 *
 * Every resolved image is PNG-guaranteed (converted via sharp if the bytes
 * aren't already PNG) and re-rendered into Apple's real @1x/@2x/@3x sizes -
 * this rescues every legacy non-PNG card_images row without a data migration.
 * icon is hard-required; an unresolved logo/strip ref is logged and skipped so
 * the pass still builds.
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
    if (this.config.APPLE_PASS_TYPE_ID)
      passJson.passTypeIdentifier = this.config.APPLE_PASS_TYPE_ID;

    // ── Assemble the bundle ───────────────────────────────────────────────
    const buffers: Record<string, Buffer> = {
      "pass.json": Buffer.from(JSON.stringify(passJson)),
    };

    // Apple requires icon.png; render true 29/58/87 renditions (@1x/@2x/@3x).
    const icon = await this.resolveImage(imageAssetRefs.icon);
    if (!icon) {
      throw new DomainError(
        "This card has no icon image. Add one in the card builder before issuing passes.",
        "DOMAIN_ERROR",
      );
    }
    const iconPng = await this.ensurePng(icon);
    const [icon1x, icon2x, icon3x] = await this.renderCoverSet(iconPng, [
      [29, 29],
      [58, 58],
      [87, 87],
    ]);
    buffers["icon.png"] = icon1x;
    buffers["icon@2x.png"] = icon2x;
    buffers["icon@3x.png"] = icon3x;

    const logo = await this.resolveImage(imageAssetRefs.logo);
    if (imageAssetRefs.logo && !logo) {
      log({
        source: "PassKitSigningAdapter",
        event: "image_unresolved",
        slot: "logo",
        ref: imageAssetRefs.logo,
      });
    }
    if (logo) {
      const logoPng = await this.ensurePng(logo);
      const [logo1x, logo2x, logo3x] = await this.renderInsideSet(logoPng, [
        [160, 50],
        [320, 100],
        [480, 150],
      ]);
      buffers["logo.png"] = logo1x;
      buffers["logo@2x.png"] = logo2x;
      buffers["logo@3x.png"] = logo3x;
    }

    const strip = await this.resolveImage(imageAssetRefs.strip);
    if (imageAssetRefs.strip && !strip) {
      log({
        source: "PassKitSigningAdapter",
        event: "image_unresolved",
        slot: "strip",
        ref: imageAssetRefs.strip,
      });
    }
    if (strip) {
      const stripPng = await this.ensurePng(strip);
      // Width-scaled only: Wallet's strip height depends on whether the card
      // has primaryFields (123pt) or not (144pt), and the builder bakes the
      // matching aspect - forcing one height would side-crop the other
      // variant on-device (see apps/web stampStrip.ts).
      const [strip1x, strip2x, strip3x] = await this.renderWidthSet(stripPng, [375, 750, 1125]);
      buffers["strip.png"] = strip1x;
      buffers["strip@2x.png"] = strip2x;
      buffers["strip@3x.png"] = strip3x;
    }

    // passkit-generator rejects an empty-string passphrase; an unencrypted signer
    // key must omit it entirely. Only pass it when a real passphrase is set.
    const pkpass = new PKPass(buffers, {
      signerCert,
      signerKey,
      wwdr,
      ...(APPLE_SIGNER_KEY_PASSPHRASE ? { signerKeyPassphrase: APPLE_SIGNER_KEY_PASSPHRASE } : {}),
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

  /** Convert to real PNG bytes if the buffer isn't already PNG-magic (legacy non-PNG rows). */
  private async ensurePng(bytes: Buffer): Promise<Buffer> {
    if (isPngBuffer(bytes)) return bytes;
    return sharp(bytes).png().toBuffer();
  }

  /** Cover-crop `png` to each exact [w, h] size (icon, strip: fills the frame, no letterboxing). */
  private async renderCoverSet(png: Buffer, sizes: Array<[number, number]>): Promise<Buffer[]> {
    return Promise.all(
      sizes.map(([w, h]) => sharp(png).resize(w, h, { fit: "cover" }).png().toBuffer()),
    );
  }

  /** Fit `png` inside each [w, h] box, aspect preserved, no pad (logo). */
  private async renderInsideSet(png: Buffer, sizes: Array<[number, number]>): Promise<Buffer[]> {
    return Promise.all(
      sizes.map(([w, h]) => sharp(png).resize(w, h, { fit: "inside" }).png().toBuffer()),
    );
  }

  /** Scale `png` to each width, aspect preserved, never enlarged (strip). */
  private async renderWidthSet(png: Buffer, widths: number[]): Promise<Buffer[]> {
    return Promise.all(
      widths.map((w) =>
        sharp(png).resize({ width: w, withoutEnlargement: true }).png().toBuffer(),
      ),
    );
  }
}

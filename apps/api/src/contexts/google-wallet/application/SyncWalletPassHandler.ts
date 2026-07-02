import type { IGoogleWalletPassRepo, IGoogleWalletRestClient } from "../domain/ports";

export class SyncWalletPassHandler {
  constructor(
    private readonly passRepo: IGoogleWalletPassRepo,
    private readonly gwClient: IGoogleWalletRestClient,
    private readonly publicBaseUrl: string,
  ) {}

  /** Stored refs are app-relative ("/api/v1/images/:id"); Google needs absolute HTTPS. */
  private absUri(ref?: string): string | undefined {
    if (!ref || !ref.trim()) return undefined;
    if (/^https?:\/\//i.test(ref)) return ref;
    const base = this.publicBaseUrl.replace(/\/$/, "");
    return `${base}${ref.startsWith("/") ? "" : "/"}${ref}`;
  }

  async execute(cmd: { passId: string; tenantId: string }): Promise<void> {
    const pass = await this.passRepo.findPassWithTemplate(cmd.passId, cmd.tenantId);
    if (!pass?.googleWalletObjectId) return;

    // Prefer the loyalty counter (key "points") for the single textModule -
    // it's what the Apple pass shows too. Fall back to the first field for
    // templates that don't define one (fieldValues[0] was the old blanket rule).
    const primary = pass.fieldValues.find((f) => f.key === "points") ?? pass.fieldValues[0];
    // Re-push the logo/hero too: createObject only runs on the FIRST save, so a
    // logo/hero swap on re-publish would otherwise never reach an existing object.
    await this.gwClient.patchObject(pass.googleWalletObjectId, {
      textModulesData: primary
        ? [{ header: primary.label, body: String(primary.value), id: "balance" }]
        : [],
      logoImageUri: this.absUri(pass.imageAssetRefs["googleLogo"] || pass.imageAssetRefs["logo"]),
      heroImageUri: this.absUri(pass.imageAssetRefs["googleStrip"] || pass.imageAssetRefs["strip"]),
    });
  }
}

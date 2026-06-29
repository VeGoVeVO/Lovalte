import type { IGoogleWalletPassRepo, IGoogleWalletRestClient } from "../domain/ports";

export class SyncWalletPassHandler {
  constructor(
    private readonly passRepo: IGoogleWalletPassRepo,
    private readonly gwClient: IGoogleWalletRestClient,
  ) {}

  async execute(cmd: { passId: string; tenantId: string }): Promise<void> {
    const pass = await this.passRepo.findPassWithTemplate(cmd.passId, cmd.tenantId);
    if (!pass?.googleWalletObjectId) return;

    const primary = pass.fieldValues[0];
    await this.gwClient.patchObject(pass.googleWalletObjectId, {
      textModulesData: primary
        ? [{ header: primary.label, body: String(primary.value), id: "balance" }]
        : [],
    });
  }
}

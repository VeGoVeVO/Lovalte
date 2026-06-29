import type { IGoogleWalletPassRepo, IGoogleWalletRestClient } from "../domain/ports";

export class ExpireWalletPassHandler {
  constructor(
    private readonly passRepo: IGoogleWalletPassRepo,
    private readonly gwClient: IGoogleWalletRestClient,
  ) {}

  async execute(cmd: { passId: string; tenantId: string }): Promise<void> {
    const pass = await this.passRepo.findPassWithTemplate(cmd.passId, cmd.tenantId);
    if (!pass?.googleWalletObjectId) return;

    await this.gwClient.patchObject(pass.googleWalletObjectId, { state: "EXPIRED" });
  }
}

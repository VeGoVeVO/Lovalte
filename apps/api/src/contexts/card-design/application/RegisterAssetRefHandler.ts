import {
  DomainError,
  NotFoundError,
  ok,
  err,
  type Result,
} from "../../../kernel";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";
import {
  toAssetRefDTO,
  type AssetRefDTO,
  type RegisterAssetRefInput,
} from "./dtos";

export class RegisterAssetRefHandler {
  constructor(private readonly repo: ICardTemplateRepository) {}

  /**
   * Store an uploaded asset reference (icon, logo, or strip image key/URL).
   * Actual S3 upload is handled by the client; this handler records the ref and
   * applies it to the draft template's BrandConfig.
   */
  async execute(input: RegisterAssetRefInput): Promise<Result<AssetRefDTO>> {
    const template = await this.repo.findById(input.templateId, input.tenantId);
    if (!template) {
      return err(new NotFoundError("Card template not found"));
    }

    try {
      template.applyAssetRef(input.kind, input.ref);
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }

    // Persist both the updated template config (brand refs updated) and the asset log entry.
    await this.repo.save(template);
    const asset = await this.repo.registerAsset({
      tenantId: input.tenantId,
      templateId: input.templateId,
      kind: input.kind,
      ref: input.ref,
    });

    // applyAssetRef does not emit cross-context events; no bus.publish needed.
    return ok(toAssetRefDTO(asset));
  }
}

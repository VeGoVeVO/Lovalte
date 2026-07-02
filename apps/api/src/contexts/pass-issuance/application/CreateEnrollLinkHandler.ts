import { ok, err, NotFoundError, type Result, type Clock } from "../../../kernel";
import type { AppConfig } from "../../../config/env";
import type { IPassTemplateRepository } from "../domain/ports";
import { signToken } from "./enrollTokens";

export interface CreateEnrollLinkInput {
  templateId: string;
  tenantId: string;
}

export interface EnrollLinkDto {
  url: string;
  token: string;
}

/**
 * Mints a signed self-enrollment link for a published template. A customer who
 * scans its QR gets a brand-new, unique member id + pass - the merchant never
 * types or manages member ids.
 */
export class CreateEnrollLinkHandler {
  constructor(
    private readonly templates: IPassTemplateRepository,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateEnrollLinkInput): Promise<Result<EnrollLinkDto>> {
    const template = await this.templates.findById(input.templateId, input.tenantId);
    if (!template) {
      return err(new NotFoundError("Publish a card template before creating an enrollment QR."));
    }
    const token = signToken(
      this.config.QR_TOKEN_SECRET,
      { typ: "enroll", templateId: input.templateId, tenantId: input.tenantId },
      Math.floor(this.clock.now().getTime() / 1000),
    );
    // The QR points at the platform-branching API endpoint (native add flow on
    // phones, web page fallback elsewhere). Old printed QRs that carry the
    // /enroll#<token> page URL keep working - the page still enrolls itself.
    return ok({
      url: `${this.config.APP_BASE_URL}/api/v1/public/enroll?t=${encodeURIComponent(token)}`,
      token,
    });
  }
}

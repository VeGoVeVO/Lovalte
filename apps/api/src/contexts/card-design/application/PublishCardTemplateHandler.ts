import { DomainError, DomainEventBus, NotFoundError, ok, err, type Result } from "../../../kernel";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";
import type { IImageRepository } from "./IImageRepository";
import type { PublishResultDTO } from "./dtos";

export interface PublishCardTemplateInput {
  templateId: string;
  tenantId: string;
}

export class PublishCardTemplateHandler {
  constructor(
    private readonly repo: ICardTemplateRepository,
    private readonly bus: DomainEventBus,
    private readonly imageRepo: IImageRepository,
  ) {}

  async execute(input: PublishCardTemplateInput): Promise<Result<PublishResultDTO>> {
    const template = await this.repo.findById(input.templateId, input.tenantId);
    if (!template) {
      return err(new NotFoundError("Card template not found"));
    }

    // Publish preflight: an icon/logo/strip ref that is SET but does not
    // resolve to a real image is worse than an absent one (it would produce a
    // broken pass at sign time). Absent logo/strip are allowed - the pass
    // still renders with text only - but surface a warning so the merchant
    // notices. Absent icon fails publish outright: Apple requires icon.png.
    const brand = template.brand;
    const warnings: string[] = [];

    if (!brand.iconRef) {
      return err(new DomainError("Card icon (iconRef) is required before publishing", "VALIDATION"));
    }
    if (!(await this.imageRepo.exists(brand.iconRef, input.tenantId))) {
      return err(
        new DomainError(
          `Card icon (iconRef) does not resolve to a stored image: ${brand.iconRef}`,
          "VALIDATION",
        ),
      );
    }

    if (brand.logoRef) {
      if (!(await this.imageRepo.exists(brand.logoRef, input.tenantId))) {
        return err(
          new DomainError(
            `Card logo (logoRef) does not resolve to a stored image: ${brand.logoRef}`,
            "VALIDATION",
          ),
        );
      }
    } else {
      warnings.push("No logo uploaded - the pass front will show only text");
    }

    if (brand.stripRef) {
      if (!(await this.imageRepo.exists(brand.stripRef, input.tenantId))) {
        return err(
          new DomainError(
            `Card strip image (stripRef) does not resolve to a stored image: ${brand.stripRef}`,
            "VALIDATION",
          ),
        );
      }
    } else {
      warnings.push("No strip image uploaded - the pass front will show only text");
    }

    try {
      template.publish();
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }

    await this.repo.save(template);

    // Pull events after the successful save and publish to the bus.
    // CardTemplatePublished is consumed by the Pass Issuance context.
    const events = template.pullEvents();
    await this.bus.publish(events);

    return ok({
      id: template.id.value,
      version: template.version,
      status: template.status,
      warnings,
    });
  }
}

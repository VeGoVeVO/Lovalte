import { DomainError, DomainEventBus, NotFoundError, ok, err, type Result } from "../../../kernel";
import { BrandConfig } from "../domain/BrandConfig";
import { RgbColor } from "../domain/RgbColor";
import { RewardRule } from "../domain/RewardRule";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";
import { toCardTemplateDTO, type CardTemplateDTO, type UpdateCardTemplateInput } from "./dtos";

export class UpdateCardTemplateHandler {
  constructor(
    private readonly repo: ICardTemplateRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: UpdateCardTemplateInput): Promise<Result<CardTemplateDTO>> {
    const template = await this.repo.findById(input.templateId, input.tenantId);
    if (!template) {
      return err(new NotFoundError("Card template not found"));
    }

    try {
      const brand = new BrandConfig({
        organizationName: input.organizationName,
        logoText: input.logoText,
        backgroundColor: RgbColor.fromString(input.backgroundColor),
        foregroundColor: RgbColor.fromString(input.foregroundColor),
        labelColor: input.labelColor ? RgbColor.fromString(input.labelColor) : undefined,
        headerFields: input.headerFields,
        primaryFields: input.primaryFields,
        secondaryFields: input.secondaryFields,
        auxiliaryFields: input.auxiliaryFields,
        backFields: input.backFields,
        // Preserve existing asset refs - use UpdateCardTemplate to change brand config only
        iconRef: template.brand.iconRef,
        logoRef: template.brand.logoRef,
        stripRef: template.brand.stripRef,
      });

      const rule = new RewardRule(input.pointsPerVisit, input.rewardThreshold, input.tierRules);

      template.updateBrand(brand, rule, input.name);
      await this.repo.save(template);
      const events = template.pullEvents();
      await this.bus.publish(events);

      return ok(toCardTemplateDTO(template));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

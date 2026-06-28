import { DomainError, DomainEventBus, ok, err, type Result } from "../../../kernel";
import { BrandConfig } from "../domain/BrandConfig";
import { CardTemplate, CardTemplateId } from "../domain/CardTemplate";
import { RgbColor } from "../domain/RgbColor";
import { RewardRule } from "../domain/RewardRule";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";
import { toCardTemplateDTO, type CardTemplateDTO, type CreateCardTemplateInput } from "./dtos";

export class CreateCardTemplateHandler {
  constructor(
    private readonly repo: ICardTemplateRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: CreateCardTemplateInput): Promise<Result<CardTemplateDTO>> {
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
        stampIcon: input.stampIcon,
      });

      const rule = new RewardRule(
        input.pointsPerVisit,
        input.rewardThreshold,
        input.tierRules,
        input.cardType,
      );

      const template = CardTemplate.create(
        CardTemplateId.generate(),
        input.tenantId,
        input.name,
        brand,
        rule,
      );

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

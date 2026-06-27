import {
  DomainError,
  DomainEventBus,
  NotFoundError,
  ok,
  err,
  type Result,
} from "../../../kernel";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";
import type { PublishResultDTO } from "./dtos";

export interface PublishCardTemplateInput {
  templateId: string;
  tenantId: string;
}

export class PublishCardTemplateHandler {
  constructor(
    private readonly repo: ICardTemplateRepository,
    private readonly bus: DomainEventBus
  ) {}

  async execute(input: PublishCardTemplateInput): Promise<Result<PublishResultDTO>> {
    const template = await this.repo.findById(input.templateId, input.tenantId);
    if (!template) {
      return err(new NotFoundError("Card template not found"));
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
    });
  }
}

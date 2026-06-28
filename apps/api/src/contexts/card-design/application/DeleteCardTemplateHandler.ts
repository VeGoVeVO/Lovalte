import type { Result, DomainEventBus } from "../../../kernel";
import { ok, err, NotFoundError } from "../../../kernel";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";

export interface DeleteCardTemplateInput {
  templateId: string;
  tenantId: string;
}

export class DeleteCardTemplateHandler {
  constructor(
    private readonly repo: ICardTemplateRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: DeleteCardTemplateInput): Promise<Result<void>> {
    const template = await this.repo.findById(input.templateId, input.tenantId);
    if (!template) {
      return err(new NotFoundError(`Template ${input.templateId} not found`));
    }
    template.delete();
    await this.repo.delete(input.templateId, input.tenantId);
    await this.bus.publish(template.pullEvents());
    return ok(undefined);
  }
}

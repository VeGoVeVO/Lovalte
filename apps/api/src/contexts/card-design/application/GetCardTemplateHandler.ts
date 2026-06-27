import { NotFoundError, ok, err, type Result } from "../../../kernel";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";
import { toCardTemplateDTO, type CardTemplateDTO } from "./dtos";

export interface GetCardTemplateInput {
  templateId: string;
  tenantId: string;
}

export class GetCardTemplateHandler {
  constructor(private readonly repo: ICardTemplateRepository) {}

  async execute(input: GetCardTemplateInput): Promise<Result<CardTemplateDTO>> {
    const template = await this.repo.findById(input.templateId, input.tenantId);
    if (!template) {
      return err(new NotFoundError("Card template not found"));
    }
    return ok(toCardTemplateDTO(template));
  }
}

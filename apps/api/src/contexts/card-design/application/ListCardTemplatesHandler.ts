import { ok, type Result } from "../../../kernel";
import type { ICardTemplateRepository } from "./ICardTemplateRepository";
import { toCardTemplateDTO, type CardTemplateDTO } from "./dtos";

export interface ListCardTemplatesInput {
  tenantId: string;
  status?: string;
}

export class ListCardTemplatesHandler {
  constructor(private readonly repo: ICardTemplateRepository) {}

  async execute(input: ListCardTemplatesInput): Promise<Result<CardTemplateDTO[]>> {
    const templates = await this.repo.findAllByTenant(input.tenantId, input.status);
    return ok(templates.map(toCardTemplateDTO));
  }
}

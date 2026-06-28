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
    const counts = await this.repo.countIssuedByTemplateIds(
      input.tenantId,
      templates.map((t) => t.id.value),
    );
    return ok(templates.map((t) => toCardTemplateDTO(t, counts.get(t.id.value) ?? 0)));
  }
}

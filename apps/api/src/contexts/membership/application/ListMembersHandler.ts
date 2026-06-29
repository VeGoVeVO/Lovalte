import type { Result } from "../../../kernel";
import { ok } from "../../../kernel";
import type { IMemberRepository } from "../domain/ports";
import { toMemberSummaryDTO, type MemberSummaryDTO } from "./dtos";

export interface ListMembersInput {
  tenantId: string;
  /** When set, only members enrolled on this card template (per-card members view). */
  cardTemplateId?: string;
}

/**
 * Returns a summary list of members with each member's live balance (summed from
 * the point ledger). Scoped to one card template when cardTemplateId is given.
 */
export class ListMembersHandler {
  constructor(private readonly members: IMemberRepository) {}

  async execute(input: ListMembersInput): Promise<Result<MemberSummaryDTO[]>> {
    const members = input.cardTemplateId
      ? await this.members.listByCardTemplate(input.cardTemplateId, input.tenantId)
      : await this.members.listByTenant(input.tenantId);
    return ok(members.map(toMemberSummaryDTO));
  }
}

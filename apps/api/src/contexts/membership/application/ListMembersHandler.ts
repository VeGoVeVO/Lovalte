import type { Result } from "../../../kernel";
import { ok } from "../../../kernel";
import type { IMemberRepository } from "../domain/ports";
import { toMemberSummaryDTO, type MemberSummaryDTO } from "./dtos";

export interface ListMembersInput {
  tenantId: string;
}

/**
 * Returns a flat summary list of all active members for a tenant,
 * including each member's live balance (summed from the point ledger)
 * and current tier.
 */
export class ListMembersHandler {
  constructor(private readonly members: IMemberRepository) {}

  async execute(input: ListMembersInput): Promise<Result<MemberSummaryDTO[]>> {
    const members = await this.members.listByTenant(input.tenantId);
    return ok(members.map(toMemberSummaryDTO));
  }
}

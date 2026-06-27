import type { Result } from "../../../kernel";
import { ok, err, NotFoundError } from "../../../kernel";
import type { IMemberRepository } from "../domain/ports";
import { toMemberDTO, type MemberDTO } from "./dtos";

export interface GetMemberInput {
  memberId: string;
  tenantId: string;
}

/** Return a single member DTO (balance computed from ledger by the repository). */
export class GetMemberHandler {
  constructor(private readonly members: IMemberRepository) {}

  async execute(input: GetMemberInput): Promise<Result<MemberDTO>> {
    const member = await this.members.findById(input.memberId, input.tenantId);
    if (!member) {
      return err(new NotFoundError(`Member ${input.memberId} not found`));
    }
    return ok(toMemberDTO(member));
  }
}

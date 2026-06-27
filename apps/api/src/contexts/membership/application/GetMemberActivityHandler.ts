import type { Result } from "../../../kernel";
import { ok, err, NotFoundError } from "../../../kernel";
import type { IMemberRepository, ILedgerRepository } from "../domain/ports";
import type { MemberActivityDTO } from "./dtos";

export interface GetMemberActivityInput {
  memberId: string;
  tenantId: string;
  page: number;
  pageSize: number;
}

/**
 * Return a paginated ledger history for a member.
 * The member existence check also enforces tenant scoping.
 */
export class GetMemberActivityHandler {
  constructor(
    private readonly members: IMemberRepository,
    private readonly ledger: ILedgerRepository,
  ) {}

  async execute(input: GetMemberActivityInput): Promise<Result<MemberActivityDTO>> {
    const member = await this.members.findById(input.memberId, input.tenantId);
    if (!member) {
      return err(new NotFoundError(`Member ${input.memberId} not found`));
    }

    const { rows, total } = await this.ledger.findByMember(
      input.memberId,
      input.tenantId,
      input.page,
      input.pageSize,
    );

    return ok({
      memberId: input.memberId,
      entries: rows.map((r) => ({
        id: r.id,
        delta: r.delta,
        reason: r.reason,
        recordedAt: r.recordedAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    });
  }
}

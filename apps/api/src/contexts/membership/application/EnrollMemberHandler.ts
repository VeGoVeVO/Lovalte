import type { Result, DomainEventBus } from "../../../kernel";
import { ok } from "../../../kernel";
import { Member } from "../domain/Member";
import { MemberId } from "../domain/MemberId";
import type { IMemberRepository } from "../domain/ports";
import { toMemberDTO, type MemberDTO } from "./dtos";

export interface EnrollMemberInput {
  passId: string;
  tenantId: string;
  displayName?: string | null;
  email?: string | null;
}

/**
 * Enrol a new member when a Pass is issued (triggered by the PassIssued event).
 * Idempotent: if a member already exists for the given passId, returns it unchanged.
 */
export class EnrollMemberHandler {
  constructor(
    private readonly members: IMemberRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: EnrollMemberInput): Promise<Result<MemberDTO>> {
    // Idempotent: return existing member without re-enrolling.
    const existing = await this.members.findByPassId(input.passId, input.tenantId);
    if (existing) {
      return ok(toMemberDTO(existing));
    }

    const id = MemberId.create();
    const member = Member.enroll({
      id,
      tenantId: input.tenantId,
      passId: input.passId,
      displayName: input.displayName,
      email: input.email,
    });

    await this.members.save(member);

    // Publish MemberEnrolled after the write succeeds.
    const events = member.pullEvents();
    await this.bus.publish(events);

    return ok(toMemberDTO(member));
  }
}

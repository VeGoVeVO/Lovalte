import type { Result, DomainEventBus } from "../../../kernel";
import { ok, err, NotFoundError } from "../../../kernel";
import type { IMemberRepository, ILedgerRepository, ITierRepository } from "../domain/ports";

export interface ApplyPointsInput {
  memberId: string;
  tenantId: string;
  /** Positive = earn; negative = redeem. */
  delta: number;
  reason: string;
  /** Optional foreign key (e.g. scan_id) for cross-context traceability. */
  referenceId?: string;
}

export interface ApplyPointsResult {
  memberId: string;
  newBalance: number;
  currentTier: string;
}

/**
 * Apply a points delta to a member:
 *  1. Load member (balance reconstituted from ledger).
 *  2. Load tenant tier rules.
 *  3. Domain: applyPoints → raises PointsEarned (and TierUpgraded if threshold crossed).
 *  4. Persist: append ledger row (source of truth), then update member tier cache.
 *  5. Publish domain events.
 *
 * Triggered internally by the RedemptionApplied bus event.
 */
export class ApplyPointsHandler {
  constructor(
    private readonly members: IMemberRepository,
    private readonly ledger: ILedgerRepository,
    private readonly tiers: ITierRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: ApplyPointsInput): Promise<Result<ApplyPointsResult>> {
    const member = await this.members.findById(input.memberId, input.tenantId);
    if (!member) {
      return err(new NotFoundError(`Member ${input.memberId} not found`));
    }

    const tierRules = await this.tiers.findByTenant(input.tenantId);

    // Domain: may throw ValidationError for non-active members.
    member.applyPoints(input.delta, tierRules);

    // Infrastructure: append ledger row first (source of truth for balance).
    await this.ledger.append({
      memberId: member.id.value,
      tenantId: input.tenantId,
      delta: input.delta,
      reason: input.reason,
      referenceId: input.referenceId,
    });

    // Update the denormalised tier cache on the members table.
    await this.members.save(member);

    // Publish after both writes succeed.
    const events = member.pullEvents();
    await this.bus.publish(events);

    return ok({
      memberId: member.id.value,
      newBalance: member.balance,
      currentTier: member.currentTier,
    });
  }
}

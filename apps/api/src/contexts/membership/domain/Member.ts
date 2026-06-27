import { AggregateRoot, ValidationError } from "../../../kernel";
import { MemberId } from "./MemberId";
import { PointsBalance } from "./PointsBalance";
import { TierRule } from "./TierRule";

export type MemberStatus = "active" | "suspended" | "deleted";

export interface MemberProps {
  id: MemberId;
  tenantId: string;
  /** Reference by ID only - never the Pass aggregate itself. */
  passId: string;
  displayName: string | null;
  /** PII - may be null for anonymous enrolment. */
  email: string | null;
  balance: PointsBalance;
  currentTier: string;
  enrolledAt: Date;
  status: MemberStatus;
}

/**
 * Member aggregate root for the Membership / Loyalty bounded context.
 *
 * Balance is always reconstituted from the append-only point_ledger;
 * it is never stored as a mutable column on the members table.
 */
export class Member extends AggregateRoot<MemberId> {
  private _tenantId: string;
  private _passId: string;
  private _displayName: string | null;
  private _email: string | null;
  private _balance: PointsBalance;
  private _currentTier: string;
  private _enrolledAt: Date;
  private _status: MemberStatus;

  private constructor(props: MemberProps) {
    super(props.id);
    this._tenantId = props.tenantId;
    this._passId = props.passId;
    this._displayName = props.displayName;
    this._email = props.email;
    this._balance = props.balance;
    this._currentTier = props.currentTier;
    this._enrolledAt = props.enrolledAt;
    this._status = props.status;
  }

  /** Factory: enrol a brand-new member at zero balance with bronze tier. */
  static enroll(props: {
    id: MemberId;
    tenantId: string;
    passId: string;
    displayName?: string | null;
    email?: string | null;
  }): Member {
    const member = new Member({
      id: props.id,
      tenantId: props.tenantId,
      passId: props.passId,
      displayName: props.displayName ?? null,
      email: props.email ?? null,
      balance: PointsBalance.of(0),
      currentTier: "bronze",
      enrolledAt: new Date(),
      status: "active",
    });
    member.addEvent(
      member.makeEvent("MemberEnrolled", {
        memberId: props.id.value,
        tenantId: props.tenantId,
        passId: props.passId,
      }),
    );
    return member;
  }

  /** Factory: reconstitute from persisted state (balance passed in from ledger sum). */
  static reconstitute(props: MemberProps): Member {
    return new Member(props);
  }

  /**
   * Apply a points delta, recompute tier, and record domain events.
   * Throws ValidationError when member is not active.
   */
  applyPoints(delta: number, tierRules: TierRule[]): void {
    if (this._status !== "active") {
      throw new ValidationError("Cannot apply points to a non-active member");
    }
    const prevTier = this._currentTier;
    this._balance = this._balance.add(delta);

    this.addEvent(
      this.makeEvent("PointsEarned", {
        memberId: this.id.value,
        tenantId: this._tenantId,
        delta,
        newBalance: this._balance.amount,
      }),
    );

    const newTier = this._computeTier(tierRules);
    if (newTier !== prevTier) {
      this._currentTier = newTier;
      this.addEvent(
        this.makeEvent("TierUpgraded", {
          memberId: this.id.value,
          tenantId: this._tenantId,
          from: prevTier,
          to: newTier,
        }),
      );
    }
  }

  private _computeTier(rules: TierRule[]): string {
    return (
      [...rules]
        .sort((a, b) => b.minPoints - a.minPoints)
        .find((r) => this._balance.amount >= r.minPoints)?.name ?? "bronze"
    );
  }

  get tenantId(): string { return this._tenantId; }
  get passId(): string { return this._passId; }
  get displayName(): string | null { return this._displayName; }
  get email(): string | null { return this._email; }
  get balance(): number { return this._balance.amount; }
  get currentTier(): string { return this._currentTier; }
  get enrolledAt(): Date { return this._enrolledAt; }
  get status(): MemberStatus { return this._status; }
}

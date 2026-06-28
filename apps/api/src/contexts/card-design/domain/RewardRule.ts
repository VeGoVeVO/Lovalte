import { ValidationError } from "../../../kernel";

export interface TierRule {
  readonly label: string;
  readonly minPoints: number;
}

/**
 * The loyalty mechanic the card runs. Drives how the primary value is shown on
 * the pass (and in the live preview): a plain count, a stamps fraction, or a
 * currency balance. They all sit on the same underlying counter.
 */
export type LoyaltyType = "points" | "stamps" | "cashback";
export const LOYALTY_TYPES: LoyaltyType[] = ["points", "stamps", "cashback"];

/**
 * Format the raw loyalty counter the way the chosen mechanic displays it.
 * Pure + shared shape with the web preview so "what you build" == "the phone".
 */
export function formatLoyaltyValue(type: LoyaltyType, raw: unknown, goal: number): string {
  const n = Number(raw);
  const safe = Number.isFinite(n) ? n : 0;
  if (type === "stamps") return `${Math.min(Math.max(safe, 0), goal)} / ${goal}`;
  if (type === "cashback") return `$${safe.toFixed(2)}`;
  return String(Math.trunc(safe));
}

/** Immutable value object encapsulating the tenant's reward configuration. */
export class RewardRule {
  readonly pointsPerVisit: number;
  readonly rewardThreshold: number;
  readonly cardType: LoyaltyType;
  readonly tierRules: ReadonlyArray<TierRule>;

  constructor(
    pointsPerVisit: number,
    rewardThreshold: number,
    tierRules: TierRule[],
    cardType: LoyaltyType = "points",
  ) {
    if (!Number.isInteger(pointsPerVisit) || pointsPerVisit < 1) {
      throw new ValidationError("pointsPerVisit must be an integer ≥1");
    }
    if (!Number.isInteger(rewardThreshold) || rewardThreshold < 1) {
      throw new ValidationError("rewardThreshold must be an integer ≥1");
    }
    if (!LOYALTY_TYPES.includes(cardType)) {
      throw new ValidationError(`cardType must be one of ${LOYALTY_TYPES.join(", ")}`);
    }
    for (const t of tierRules) {
      if (!Number.isInteger(t.minPoints) || t.minPoints < 0) {
        throw new ValidationError(`Tier rule "${t.label}" minPoints must be an integer ≥0`);
      }
    }
    this.pointsPerVisit = pointsPerVisit;
    this.rewardThreshold = rewardThreshold;
    this.cardType = cardType;
    this.tierRules = Object.freeze([...tierRules]);
  }

  toJSON(): Record<string, unknown> {
    return {
      pointsPerVisit: this.pointsPerVisit,
      rewardThreshold: this.rewardThreshold,
      cardType: this.cardType,
      tierRules: [...this.tierRules],
    };
  }
}

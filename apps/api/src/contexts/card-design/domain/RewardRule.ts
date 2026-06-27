import { ValidationError } from "../../../kernel";

export interface TierRule {
  readonly label: string;
  readonly minPoints: number;
}

/** Immutable value object encapsulating the tenant's points-based reward configuration. */
export class RewardRule {
  readonly pointsPerVisit: number;
  readonly rewardThreshold: number;
  readonly tierRules: ReadonlyArray<TierRule>;

  constructor(pointsPerVisit: number, rewardThreshold: number, tierRules: TierRule[]) {
    if (!Number.isInteger(pointsPerVisit) || pointsPerVisit < 1) {
      throw new ValidationError("pointsPerVisit must be an integer ≥1");
    }
    if (!Number.isInteger(rewardThreshold) || rewardThreshold < 1) {
      throw new ValidationError("rewardThreshold must be an integer ≥1");
    }
    for (const t of tierRules) {
      if (!Number.isInteger(t.minPoints) || t.minPoints < 0) {
        throw new ValidationError(`Tier rule "${t.label}" minPoints must be an integer ≥0`);
      }
    }
    this.pointsPerVisit = pointsPerVisit;
    this.rewardThreshold = rewardThreshold;
    this.tierRules = Object.freeze([...tierRules]);
  }

  toJSON(): Record<string, unknown> {
    return {
      pointsPerVisit: this.pointsPerVisit,
      rewardThreshold: this.rewardThreshold,
      tierRules: [...this.tierRules],
    };
  }
}

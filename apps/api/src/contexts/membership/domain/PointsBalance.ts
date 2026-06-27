import { ValidationError } from "../../../kernel";

/**
 * Immutable value object representing a non-negative points balance.
 * Enforce via factory: PointsBalance.of(n) throws if n < 0.
 */
export class PointsBalance {
  private constructor(private readonly _amount: number) {}

  static of(n: number): PointsBalance {
    if (n < 0) {
      throw new ValidationError(`PointsBalance cannot be negative (got ${n})`);
    }
    return new PointsBalance(Math.floor(n));
  }

  /** Returns a new PointsBalance with delta added (positive or negative). */
  add(delta: number): PointsBalance {
    return PointsBalance.of(this._amount + delta);
  }

  get amount(): number {
    return this._amount;
  }

  equals(other: PointsBalance): boolean {
    return this._amount === other._amount;
  }
}

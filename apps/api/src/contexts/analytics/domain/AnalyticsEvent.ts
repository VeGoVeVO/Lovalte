/**
 * Analytics context — domain types.
 * Read-model only: no aggregate, no domain events emitted from this context.
 * Imports ONLY from "../../../kernel".
 */

export const EVENT_TYPES = [
  "pass_issued",
  "scan",
  "redeem",
  "points_earned",
  "points_redeemed",
  "tier_upgraded",
  "template_published",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Typed, immutable representation of an analytics fact before persistence.
 * Constructed only through `createAnalyticsEvent` to enforce invariants.
 */
export interface AnalyticsEventData {
  readonly tenantId: string;
  readonly type: EventType;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

/**
 * Factory: validate inputs and return an AnalyticsEventData.
 * Throws on invalid type or missing tenantId — enforces append-only invariant
 * that only known, well-formed events reach the write path.
 */
export function createAnalyticsEvent(
  type: string,
  tenantId: string,
  occurredAt: Date,
  payload: Record<string, unknown>,
): AnalyticsEventData {
  if (!(EVENT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unknown analytics event type: "${type}". Allowed: ${EVENT_TYPES.join(", ")}`);
  }
  if (!tenantId || tenantId.trim().length === 0) {
    throw new Error("tenantId is required for analytics events");
  }
  return {
    tenantId: tenantId.trim(),
    type: type as EventType,
    occurredAt,
    payload,
  };
}

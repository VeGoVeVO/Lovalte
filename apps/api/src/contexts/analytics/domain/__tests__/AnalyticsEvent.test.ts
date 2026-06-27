import { describe, it, expect } from "vitest";
import { createAnalyticsEvent, EVENT_TYPES } from "../AnalyticsEvent";

describe("createAnalyticsEvent", () => {
  it("creates a valid analytics event with all required fields", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const event = createAnalyticsEvent(
      "pass_issued",
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      now,
      { passId: "pass-1", memberId: "member-1" },
    );

    expect(event.type).toBe("pass_issued");
    expect(event.tenantId).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(event.occurredAt).toBe(now);
    expect(event.payload).toEqual({ passId: "pass-1", memberId: "member-1" });
  });

  it("throws on an unknown event type", () => {
    expect(() =>
      createAnalyticsEvent("cart_abandoned", "tenant-uuid", new Date(), {}),
    ).toThrow('Unknown analytics event type: "cart_abandoned"');
  });

  it("throws when tenantId is empty string", () => {
    expect(() =>
      createAnalyticsEvent("scan", "", new Date(), {}),
    ).toThrow("tenantId is required");
  });

  it("throws when tenantId is whitespace only", () => {
    expect(() =>
      createAnalyticsEvent("scan", "   ", new Date(), {}),
    ).toThrow("tenantId is required");
  });

  it("trims whitespace from tenantId", () => {
    const event = createAnalyticsEvent("scan", "  my-tenant  ", new Date(), {});
    expect(event.tenantId).toBe("my-tenant");
  });

  it("does not throw for any declared event type", () => {
    const tenantId = "a1b2c3d4-0000-0000-0000-000000000001";
    for (const type of EVENT_TYPES) {
      expect(() =>
        createAnalyticsEvent(type, tenantId, new Date(), {}),
      ).not.toThrow();
    }
  });

  it("returns a frozen payload reference (not mutated by factory)", () => {
    const payload = { memberId: "m1", pointsDelta: 10 };
    const event = createAnalyticsEvent("points_earned", "tenant-id", new Date(), payload);
    // payload object is the same reference - factory does not deep-clone
    expect(event.payload).toBe(payload);
  });
});

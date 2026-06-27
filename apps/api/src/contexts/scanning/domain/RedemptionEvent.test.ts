import { describe, it, expect } from "vitest";
import { RedemptionEvent } from "./RedemptionEvent";

describe("RedemptionEvent", () => {
  const baseParams = {
    tenantId: "tenant-uuid-1",
    passId: "pass-uuid-1",
    idempotencyKey: "idem-key-1",
    createdAt: new Date("2026-01-15T10:00:00Z"),
  };

  it("records an award and emits RedemptionApplied with positive delta", () => {
    const evt = RedemptionEvent.record({
      ...baseParams,
      action: "award",
      delta: 10,
    });

    expect(evt.action).toBe("award");
    expect(evt.delta).toBe(10);
    expect(evt.passId).toBe("pass-uuid-1");
    expect(evt.tenantId).toBe("tenant-uuid-1");
    expect(evt.idempotencyKey).toBe("idem-key-1");
    expect(evt.id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const events = evt.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("RedemptionApplied");
    expect(events[0].payload.passId).toBe("pass-uuid-1");
    expect(events[0].payload.tenantId).toBe("tenant-uuid-1");
    expect(events[0].payload.delta).toBe(10);
    expect(events[0].payload.action).toBe("award");
    expect(events[0].aggregateId).toBe(evt.id.value);
  });

  it("records a redeem with negative delta", () => {
    const evt = RedemptionEvent.record({
      ...baseParams,
      action: "redeem",
      delta: -50,
    });

    expect(evt.delta).toBe(-50);
    expect(evt.action).toBe("redeem");

    const [domainEvt] = evt.pullEvents();
    expect(domainEvt.payload.delta).toBe(-50);
    expect(domainEvt.payload.action).toBe("redeem");
  });

  it("pullEvents clears the queue — second call returns empty", () => {
    const evt = RedemptionEvent.record({
      ...baseParams,
      action: "award",
      delta: 1,
    });

    evt.pullEvents(); // drain
    expect(evt.pullEvents()).toHaveLength(0);
  });

  it("each record() call generates a unique id", () => {
    const a = RedemptionEvent.record({ ...baseParams, action: "award", delta: 5 });
    const b = RedemptionEvent.record({ ...baseParams, action: "award", delta: 5 });
    expect(a.id.value).not.toBe(b.id.value);
  });

  it("reconstitute does not emit domain events", () => {
    const evt = RedemptionEvent.reconstitute({
      id: "00000000-0000-4000-8000-000000000001",
      ...baseParams,
      action: "award",
      delta: 10,
    });

    expect(evt.pullEvents()).toHaveLength(0);
  });
});

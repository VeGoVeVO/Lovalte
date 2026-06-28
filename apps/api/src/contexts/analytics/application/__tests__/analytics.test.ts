import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetAnalyticsOverviewHandler } from "../GetAnalyticsOverviewHandler";
import {
  GetAnalyticsTimeseriesHandler,
  type TimeseriesInput,
} from "../GetAnalyticsTimeseriesHandler";
import type { IAnalyticsRepository, OverviewDTO, TimeseriesPoint } from "../ports";
import type { AnalyticsEventData, EventType } from "../../domain/AnalyticsEvent";
import { createAnalyticsEvent, EVENT_TYPES } from "../../domain/AnalyticsEvent";
import type { DomainEvent, DomainEventBus, DomainEventHandler } from "../../../../kernel";
import { ValidationError } from "../../../../kernel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT_ID = "tenant-uuid-1";

function makeRepoFake(
  opts: {
    overview?: OverviewDTO;
    series?: TimeseriesPoint[];
  } = {},
): IAnalyticsRepository & { inserted: AnalyticsEventData[] } {
  const inserted: AnalyticsEventData[] = [];
  const overview: OverviewDTO = opts.overview ?? {
    totalMembers: 42,
    totalScans: 200,
    totalRedemptions: 35,
    pointsLiability: 1500,
  };
  return {
    inserted,
    insertEvent: vi.fn().mockImplementation(async (data: AnalyticsEventData) => {
      inserted.push(data);
    }),
    getOverview: vi.fn().mockResolvedValue(overview),
    getTimeseries: vi.fn().mockResolvedValue(opts.series ?? []),
  };
}

/** Minimal synchronous in-process event bus. */
function makeInMemoryBus(): DomainEventBus {
  const handlers = new Map<string, DomainEventHandler[]>();
  return {
    subscribe(name: string, handler: DomainEventHandler): void {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    async publish(events: DomainEvent[]): Promise<void> {
      for (const evt of events) {
        for (const h of handlers.get(evt.name) ?? []) {
          await h(evt);
        }
      }
    },
  };
}

function makeEvent(name: string, payload: Record<string, unknown>): DomainEvent {
  return { name, occurredAt: new Date("2026-06-01T12:00:00Z"), aggregateId: "agg-1", payload };
}

// ─── ACL subscription helpers ─────────────────────────────────────────────────
//
// These mirror the subscription closures registered in analytics/index.ts so we
// can test them in isolation without spinning up the full Fastify app.

function registerAnalyticsSubscriptions(bus: DomainEventBus, repo: IAnalyticsRepository): void {
  function extractTenantId(payload: Record<string, unknown>): string | null {
    const tid = payload["tenantId"];
    if (typeof tid === "string" && tid.trim().length > 0) return tid.trim();
    return null;
  }

  async function ingest(
    type: string,
    tenantId: string,
    occurredAt: Date,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const data = createAnalyticsEvent(type, tenantId, occurredAt, payload);
      await repo.insertEvent(data);
    } catch {
      // best-effort - swallow errors
    }
  }

  bus.subscribe("PassIssued", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("pass_issued", tenantId, event.occurredAt, {
      passId: event.payload["passId"] ?? event.aggregateId,
      memberId: event.payload["memberId"],
    });
  });

  bus.subscribe("RedemptionApplied", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("redeem", tenantId, event.occurredAt, {
      passId: event.payload["passId"],
      memberId: event.payload["memberId"],
      pointsDelta: event.payload["pointsDelta"],
    });
  });

  bus.subscribe("PointsEarned", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("points_earned", tenantId, event.occurredAt, {
      memberId: event.payload["memberId"],
      pointsDelta: event.payload["delta"],
      newBalance: event.payload["newBalance"],
    });
  });

  bus.subscribe("TierUpgraded", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("tier_upgraded", tenantId, event.occurredAt, {
      memberId: event.payload["memberId"],
      tierFrom: event.payload["from"],
      tierTo: event.payload["to"],
    });
  });

  bus.subscribe("CardTemplatePublished", async (event) => {
    const tenantId = extractTenantId(event.payload);
    if (!tenantId) return;
    await ingest("template_published", tenantId, event.occurredAt, {
      templateId: event.payload["templateId"] ?? event.aggregateId,
    });
  });
}

// ─── Event subscription tests ────────────────────────────────────────────────

describe("Analytics ACL subscriptions", () => {
  let repo: ReturnType<typeof makeRepoFake>;
  let bus: DomainEventBus;

  beforeEach(() => {
    repo = makeRepoFake();
    bus = makeInMemoryBus();
    registerAnalyticsSubscriptions(bus, repo);
  });

  it("PassIssued → inserts a 'pass_issued' analytics event", async () => {
    await bus.publish([
      makeEvent("PassIssued", {
        tenantId: TENANT_ID,
        passId: "pass-uuid-1",
        memberId: "member-uuid-1",
      }),
    ]);

    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0].type).toBe("pass_issued");
    expect(repo.inserted[0].tenantId).toBe(TENANT_ID);
    expect(repo.inserted[0].payload.passId).toBe("pass-uuid-1");
    expect(repo.inserted[0].payload.memberId).toBe("member-uuid-1");
  });

  it("RedemptionApplied → inserts a 'redeem' analytics event", async () => {
    await bus.publish([
      makeEvent("RedemptionApplied", {
        tenantId: TENANT_ID,
        passId: "pass-uuid-2",
        memberId: "member-uuid-2",
        pointsDelta: -50,
      }),
    ]);

    expect(repo.inserted).toHaveLength(1);
    const evt = repo.inserted[0];
    expect(evt.type).toBe("redeem");
    expect(evt.tenantId).toBe(TENANT_ID);
    expect(evt.payload.passId).toBe("pass-uuid-2");
    expect(evt.payload.pointsDelta).toBe(-50);
  });

  it("PointsEarned → inserts a 'points_earned' analytics event", async () => {
    await bus.publish([
      makeEvent("PointsEarned", {
        tenantId: TENANT_ID,
        memberId: "member-uuid-3",
        delta: 100,
        newBalance: 350,
      }),
    ]);

    expect(repo.inserted).toHaveLength(1);
    const evt = repo.inserted[0];
    expect(evt.type).toBe("points_earned");
    expect(evt.payload.pointsDelta).toBe(100);
    expect(evt.payload.newBalance).toBe(350);
  });

  it("TierUpgraded → inserts a 'tier_upgraded' analytics event", async () => {
    await bus.publish([
      makeEvent("TierUpgraded", {
        tenantId: TENANT_ID,
        memberId: "member-uuid-4",
        from: "bronze",
        to: "silver",
      }),
    ]);

    expect(repo.inserted).toHaveLength(1);
    const evt = repo.inserted[0];
    expect(evt.type).toBe("tier_upgraded");
    expect(evt.payload.tierFrom).toBe("bronze");
    expect(evt.payload.tierTo).toBe("silver");
  });

  it("CardTemplatePublished → inserts a 'template_published' analytics event", async () => {
    await bus.publish([
      makeEvent("CardTemplatePublished", {
        tenantId: TENANT_ID,
        templateId: "template-uuid-1",
      }),
    ]);

    expect(repo.inserted).toHaveLength(1);
    const evt = repo.inserted[0];
    expect(evt.type).toBe("template_published");
    expect(evt.payload.templateId).toBe("template-uuid-1");
  });

  it("falls back to aggregateId for templateId when missing from payload", async () => {
    await bus.publish([makeEvent("CardTemplatePublished", { tenantId: TENANT_ID })]);

    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0].payload.templateId).toBe("agg-1");
  });

  it("silently skips events with missing tenantId", async () => {
    await bus.publish([makeEvent("PassIssued", { passId: "p-1" })]);

    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("silently skips events with empty tenantId", async () => {
    await bus.publish([makeEvent("PointsEarned", { tenantId: "  ", delta: 10 })]);

    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("subscribes to all five event types (cross-check)", async () => {
    const tenantPayload = { tenantId: TENANT_ID };
    await bus.publish([
      makeEvent("PassIssued", { ...tenantPayload, passId: "p1" }),
      makeEvent("RedemptionApplied", { ...tenantPayload, passId: "p1" }),
      makeEvent("PointsEarned", { ...tenantPayload, delta: 10 }),
      makeEvent("TierUpgraded", { ...tenantPayload, from: "a", to: "b" }),
      makeEvent("CardTemplatePublished", { ...tenantPayload }),
    ]);

    expect(repo.inserted).toHaveLength(5);
  });
});

// ─── GetAnalyticsOverviewHandler ─────────────────────────────────────────────

describe("GetAnalyticsOverviewHandler", () => {
  it("returns the overview DTO from the repository", async () => {
    const overview: OverviewDTO = {
      totalMembers: 100,
      totalScans: 500,
      totalRedemptions: 75,
      pointsLiability: 3000,
    };
    const repo = makeRepoFake({ overview });
    const handler = new GetAnalyticsOverviewHandler(repo);

    const result = await handler.execute(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(overview);
    expect(repo.getOverview).toHaveBeenCalledWith(TENANT_ID);
  });

  it("passes the tenantId through to the repository", async () => {
    const repo = makeRepoFake();
    const handler = new GetAnalyticsOverviewHandler(repo);

    await handler.execute("another-tenant");

    expect(repo.getOverview).toHaveBeenCalledWith("another-tenant");
  });
});

// ─── GetAnalyticsTimeseriesHandler ───────────────────────────────────────────

describe("GetAnalyticsTimeseriesHandler", () => {
  const validInput: TimeseriesInput = {
    tenantId: TENANT_ID,
    metric: "scan",
    from: "2026-05-01T00:00:00Z",
    to: "2026-05-31T23:59:59Z",
  };

  it("returns a timeseries DTO when metric and dates are valid", async () => {
    const series: TimeseriesPoint[] = [
      { day: "2026-05-01", count: 12 },
      { day: "2026-05-02", count: 8 },
    ];
    const repo = makeRepoFake({ series });
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    const result = await handler.execute(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metric).toBe("scan");
    expect(result.value.series).toEqual(series);
    expect(result.value.from).toBe(new Date(validInput.from).toISOString());
    expect(result.value.to).toBe(new Date(validInput.to).toISOString());
  });

  it("delegates to the repo with the correct tenantId and metric", async () => {
    const repo = makeRepoFake();
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    await handler.execute(validInput);

    expect(repo.getTimeseries).toHaveBeenCalledWith(
      TENANT_ID,
      "scan" as EventType,
      new Date(validInput.from),
      new Date(validInput.to),
    );
  });

  it("returns ValidationError for an unknown metric", async () => {
    const repo = makeRepoFake();
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    const result = await handler.execute({ ...validInput, metric: "cart_abandoned" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toMatch(/cart_abandoned/);
    expect(repo.getTimeseries).not.toHaveBeenCalled();
  });

  it("returns ValidationError when 'from' is not a valid date", async () => {
    const repo = makeRepoFake();
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    const result = await handler.execute({ ...validInput, from: "not-a-date" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toMatch(/'from'/);
  });

  it("returns ValidationError when 'to' is not a valid date", async () => {
    const repo = makeRepoFake();
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    const result = await handler.execute({ ...validInput, to: "not-a-date" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toMatch(/'to'/);
  });

  it("returns ValidationError when 'from' is after 'to'", async () => {
    const repo = makeRepoFake();
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    const result = await handler.execute({
      ...validInput,
      from: "2026-06-01T00:00:00Z",
      to: "2026-05-01T00:00:00Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toMatch(/after/);
  });

  it.each(EVENT_TYPES)("accepts every declared event type: '%s'", async (metric) => {
    const repo = makeRepoFake();
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    const result = await handler.execute({ ...validInput, metric });

    expect(result.ok).toBe(true);
  });

  it("returns an empty series array when no data exists for the range", async () => {
    const repo = makeRepoFake({ series: [] });
    const handler = new GetAnalyticsTimeseriesHandler(repo);

    const result = await handler.execute(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.series).toEqual([]);
  });
});

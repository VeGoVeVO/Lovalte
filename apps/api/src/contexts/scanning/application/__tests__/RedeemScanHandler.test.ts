import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedeemScanHandler, type RedeemScanCommand } from "../RedeemScanHandler";
import type { IRedemptionEventRepository, IPassLookup, ICacheStore } from "../ports";
import type { DomainEvent, DomainEventBus, Clock } from "../../../../kernel";
import { ValidationError, NotFoundError } from "../../../../kernel";

// ─── Fakes ───────────────────────────────────────────────────────────────────

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PASS_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-01T10:00:00Z");

/** The wallet barcode is now the bare passId (a UUID). */
function makePassLookup(belongs = true): IPassLookup {
  return { existsForTenant: vi.fn().mockResolvedValue(belongs) };
}

function makeCacheStore(opts: { cachedIdem?: string | null } = {}): ICacheStore {
  const { cachedIdem = null } = opts;
  return {
    setNx: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(cachedIdem),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRepo(): IRedemptionEventRepository & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    save: vi.fn().mockImplementation(async (evt) => {
      saved.push(evt);
    }),
  };
}

function makeBus(): DomainEventBus & { published: DomainEvent[] } {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: vi.fn().mockImplementation(async (events: DomainEvent[]) => {
      published.push(...events);
    }),
    subscribe: vi.fn(),
  };
}

const fixedClock: Clock = { now: () => NOW };

const baseCmd: RedeemScanCommand = {
  qrPayload: PASS_ID,
  action: "award",
  amount: 10,
  idempotencyKey: "idem-key-abc",
  callerTenantId: TENANT_ID,
  staffUserId: "staff-uuid-1",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("RedeemScanHandler", () => {
  let repo: ReturnType<typeof makeRepo>;
  let bus: ReturnType<typeof makeBus>;

  beforeEach(() => {
    repo = makeRepo();
    bus = makeBus();
  });

  describe("happy path - award", () => {
    it("persists a RedemptionEvent, returns the DTO, and emits RedemptionApplied", async () => {
      const passes = makePassLookup(true);
      const cache = makeCacheStore({ cachedIdem: null });
      const handler = new RedeemScanHandler(repo, passes, cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.passId).toBe(PASS_ID);
      expect(result.value.action).toBe("award");
      expect(result.value.delta).toBe(10);
      expect(typeof result.value.eventId).toBe("string");

      // resolved scoped to the caller's tenant
      expect(passes.existsForTenant).toHaveBeenCalledWith(PASS_ID, TENANT_ID);

      // repo.save was called once
      expect(repo.save).toHaveBeenCalledOnce();

      // bus.publish was called with a RedemptionApplied event
      expect(bus.publish).toHaveBeenCalledOnce();
      expect(bus.published).toHaveLength(1);
      const domainEvt = bus.published[0];
      expect(domainEvt.name).toBe("RedemptionApplied");
      expect(domainEvt.payload.passId).toBe(PASS_ID);
      expect(domainEvt.payload.tenantId).toBe(TENANT_ID);
      expect(domainEvt.payload.delta).toBe(10);
      expect(domainEvt.payload.action).toBe("award");
    });

    it("stores negative delta for a 'redeem' action", async () => {
      const handler = new RedeemScanHandler(
        repo,
        makePassLookup(true),
        makeCacheStore(),
        bus,
        fixedClock,
      );

      const result = await handler.execute({ ...baseCmd, action: "redeem", amount: 25 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.delta).toBe(-25);
      expect(result.value.action).toBe("redeem");

      const domainEvt = bus.published[0];
      expect(domainEvt.payload.delta).toBe(-25);
    });
  });

  describe("reusable wallet QR (no single-use)", () => {
    it("awards again on a repeat scan of the same card - the loyalty card is reusable", async () => {
      const cache = makeCacheStore({ cachedIdem: null }); // fresh visit (new idempotency key)
      const handler = new RedeemScanHandler(repo, makePassLookup(true), cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(repo.save).toHaveBeenCalled();
      expect(bus.publish).toHaveBeenCalled();
    });
  });

  describe("idempotency guard", () => {
    it("returns the prior result without re-saving when the idempotency key is already cached", async () => {
      const priorResult = {
        eventId: "prior-event-id",
        passId: PASS_ID,
        action: "award",
        delta: 10,
      };
      const cache = makeCacheStore({ cachedIdem: JSON.stringify(priorResult) });
      const handler = new RedeemScanHandler(repo, makePassLookup(true), cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(priorResult);

      // must not write again
      expect(repo.save).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
    });
  });

  describe("unknown / foreign card", () => {
    it("returns NotFoundError when the pass is not in the caller's tenant (RLS-scoped lookup misses)", async () => {
      const passes = makePassLookup(false); // foreign or unknown pass → invisible
      const handler = new RedeemScanHandler(repo, passes, makeCacheStore(), bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("returns ValidationError when the scanned payload is not a passId (e.g. a random URL QR)", async () => {
      const passes = makePassLookup(true);
      const handler = new RedeemScanHandler(repo, passes, makeCacheStore(), bus, fixedClock);

      const result = await handler.execute({ ...baseCmd, qrPayload: "https://example.com/promo" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
      // never even looks it up
      expect(passes.existsForTenant).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("input validation", () => {
    it("returns ValidationError when amount is zero", async () => {
      const passes = makePassLookup(true);
      const handler = new RedeemScanHandler(repo, passes, makeCacheStore(), bus, fixedClock);

      const result = await handler.execute({ ...baseCmd, amount: 0 });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
      // pass is never resolved for invalid input
      expect(passes.existsForTenant).not.toHaveBeenCalled();
    });

    it("returns ValidationError when amount is negative", async () => {
      const handler = new RedeemScanHandler(
        repo,
        makePassLookup(true),
        makeCacheStore(),
        bus,
        fixedClock,
      );

      const result = await handler.execute({ ...baseCmd, amount: -5 });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
    });
  });
});

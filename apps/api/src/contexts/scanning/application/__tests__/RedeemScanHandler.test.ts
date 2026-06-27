import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedeemScanHandler, type RedeemScanCommand } from "../RedeemScanHandler";
import type { IRedemptionEventRepository, IQrVerifier, ICacheStore } from "../ports";
import type { DomainEvent, DomainEventBus, Clock } from "../../../../kernel";
import { ValidationError, ConflictError, ForbiddenError } from "../../../../kernel";
import { QrToken } from "../../domain/QrToken";

// ─── Fakes ───────────────────────────────────────────────────────────────────

const TENANT_ID = "tenant-uuid-1";
const PASS_ID = "pass-uuid-1";
const NONCE = "aabbccddeeff0011";
const NOW = new Date("2026-06-01T10:00:00Z");

function makeToken(overrides: Partial<ReturnType<typeof QrToken.create>["props"]> = {}): QrToken {
  return QrToken.create({
    passId: PASS_ID,
    tenantId: TENANT_ID,
    nonce: NONCE,
    iat: Math.floor(NOW.getTime() / 1000) - 60,
    exp: Math.floor(NOW.getTime() / 1000) + 315360000, // +10 years
    ...overrides,
  });
}

function makeCacheStore(opts: {
  nonceIsNew?: boolean;
  cachedIdem?: string | null;
} = {}): ICacheStore {
  const { nonceIsNew = true, cachedIdem = null } = opts;
  return {
    setNx: vi.fn().mockResolvedValue(nonceIsNew),
    get: vi.fn().mockResolvedValue(cachedIdem),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRepo(): IRedemptionEventRepository & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    save: vi.fn().mockImplementation(async (evt) => { saved.push(evt); }),
  };
}

function makeBus(): DomainEventBus & { published: DomainEvent[] } {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: vi.fn().mockImplementation(async (events: DomainEvent[]) => { published.push(...events); }),
    subscribe: vi.fn(),
  };
}

const fixedClock: Clock = { now: () => NOW };

const baseCmd: RedeemScanCommand = {
  qrPayload: "valid.qr.token",
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

  describe("happy path — award", () => {
    it("persists a RedemptionEvent, returns the DTO, and emits RedemptionApplied", async () => {
      const verifier: IQrVerifier = { verify: vi.fn().mockResolvedValue(makeToken()) };
      const cache = makeCacheStore({ nonceIsNew: true, cachedIdem: null });
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.passId).toBe(PASS_ID);
      expect(result.value.action).toBe("award");
      expect(result.value.delta).toBe(10);
      expect(typeof result.value.eventId).toBe("string");

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
      const verifier: IQrVerifier = { verify: vi.fn().mockResolvedValue(makeToken()) };
      const cache = makeCacheStore({ nonceIsNew: true, cachedIdem: null });
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

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
    it("awards again on a repeat scan of the same token — the loyalty card is reusable", async () => {
      const verifier: IQrVerifier = { verify: vi.fn().mockResolvedValue(makeToken()) };
      const cache = makeCacheStore({ cachedIdem: null }); // fresh visit (new idempotency key)
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

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
      const verifier: IQrVerifier = { verify: vi.fn().mockResolvedValue(makeToken()) };
      const cache = makeCacheStore({
        nonceIsNew: true,
        cachedIdem: JSON.stringify(priorResult),
      });
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(priorResult);

      // must not write again
      expect(repo.save).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
    });
  });

  describe("forged / expired token", () => {
    it("returns ValidationError when the verifier throws a non-DomainError", async () => {
      const verifier: IQrVerifier = {
        verify: vi.fn().mockRejectedValue(new Error("jwt malformed")),
      };
      const cache = makeCacheStore();
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("propagates a ForbiddenError thrown by the verifier (forged signature)", async () => {
      const verifier: IQrVerifier = {
        verify: vi.fn().mockRejectedValue(new ForbiddenError("invalid signature")),
      };
      const cache = makeCacheStore();
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ForbiddenError);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("returns ForbiddenError when the token tenant does not match the caller", async () => {
      const tokenForOtherTenant = makeToken({ tenantId: "other-tenant" });
      const verifier: IQrVerifier = { verify: vi.fn().mockResolvedValue(tokenForOtherTenant) };
      const cache = makeCacheStore();
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

      const result = await handler.execute(baseCmd);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ForbiddenError);
      expect(result.error.message).toMatch(/tenant mismatch/i);
    });
  });

  describe("input validation", () => {
    it("returns ValidationError when amount is zero", async () => {
      const verifier: IQrVerifier = { verify: vi.fn() };
      const cache = makeCacheStore();
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

      const result = await handler.execute({ ...baseCmd, amount: 0 });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
      // verifier is never called for invalid input
      expect(verifier.verify).not.toHaveBeenCalled();
    });

    it("returns ValidationError when amount is negative", async () => {
      const verifier: IQrVerifier = { verify: vi.fn() };
      const cache = makeCacheStore();
      const handler = new RedeemScanHandler(repo, verifier, cache, bus, fixedClock);

      const result = await handler.execute({ ...baseCmd, amount: -5 });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
    });
  });
});

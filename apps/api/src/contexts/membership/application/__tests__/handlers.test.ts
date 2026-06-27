import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApplyPointsHandler } from "../ApplyPointsHandler";
import { EnrollMemberHandler } from "../EnrollMemberHandler";
import { Member } from "../../domain/Member";
import { MemberId } from "../../domain/MemberId";
import { PointsBalance } from "../../domain/PointsBalance";
import type { IMemberRepository, ILedgerRepository, ITierRepository, LedgerRow } from "../../domain/ports";
import type { TierRule } from "../../domain/TierRule";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";

// ── Shared constants ────────────────────────────────────────────────────────

const TENANT_ID = "tenant-1";
const PASS_ID   = "pass-uuid-1";

const TIERS: TierRule[] = [
  { name: "bronze", minPoints: 0   },
  { name: "silver", minPoints: 100 },
  { name: "gold",   minPoints: 500 },
];

// ── Factory helpers ─────────────────────────────────────────────────────────

function makeActiveMember(balance = 0, tier = "bronze"): Member {
  return Member.reconstitute({
    id:          MemberId.create(),
    tenantId:    TENANT_ID,
    passId:      PASS_ID,
    displayName: null,
    email:       null,
    balance:     PointsBalance.of(balance),
    currentTier: tier,
    enrolledAt:  new Date("2026-01-01T00:00:00.000Z"),
    status:      "active",
  });
}

function makeMemberRepo(overrides?: Partial<IMemberRepository>): IMemberRepository {
  return {
    findById:     vi.fn().mockResolvedValue(null),
    findByPassId: vi.fn().mockResolvedValue(null),
    save:         vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeLedgerRepo(): ILedgerRepository {
  const rows: LedgerRow[] = [];
  return {
    append: vi.fn().mockImplementation(async (row) => {
      rows.push({
        id:         "row-" + rows.length,
        memberId:   row.memberId,
        tenantId:   row.tenantId,
        delta:      row.delta,
        reason:     row.reason,
        recordedAt: new Date(),
      });
    }),
    findByMember: vi.fn().mockResolvedValue({ rows, total: rows.length }),
  };
}

function makeTierRepo(rules = TIERS): ITierRepository {
  return { findByTenant: vi.fn().mockResolvedValue(rules) };
}

function makeBus(): DomainEventBus & { captured: DomainEvent[] } {
  const captured: DomainEvent[] = [];
  return {
    captured,
    publish:   vi.fn().mockImplementation(async (evts: DomainEvent[]) => { captured.push(...evts); }),
    subscribe: vi.fn(),
  };
}

// ── ApplyPointsHandler ──────────────────────────────────────────────────────

describe("ApplyPointsHandler", () => {
  let bus: ReturnType<typeof makeBus>;
  let ledger: ILedgerRepository;
  let tiers: ITierRepository;

  beforeEach(() => {
    bus    = makeBus();
    ledger = makeLedgerRepo();
    tiers  = makeTierRepo();
  });

  it("appends a ledger row with correct delta and reason", async () => {
    const member  = makeActiveMember(50);
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(member) });

    const h      = new ApplyPointsHandler(members, ledger, tiers, bus);
    const result = await h.execute({
      memberId:  member.id.value,
      tenantId:  TENANT_ID,
      delta:     30,
      reason:    "purchase",
    });

    expect(result.ok).toBe(true);
    expect(ledger.append).toHaveBeenCalledOnce();
    const appendArg = (ledger.append as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(appendArg.delta).toBe(30);
    expect(appendArg.reason).toBe("purchase");
    expect(appendArg.memberId).toBe(member.id.value);
  });

  it("emits PointsEarned with newBalance after delta applied", async () => {
    const member  = makeActiveMember(50);
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(member) });

    const h      = new ApplyPointsHandler(members, ledger, tiers, bus);
    const result = await h.execute({
      memberId: member.id.value, tenantId: TENANT_ID, delta: 30, reason: "purchase",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.newBalance).toBe(80);
    const earned = bus.captured.find(e => e.name === "PointsEarned");
    expect(earned).toBeDefined();
    expect(earned!.payload.newBalance).toBe(80);
    expect(earned!.payload.delta).toBe(30);
  });

  it("emits TierUpgraded when points cross a tier threshold", async () => {
    // 90 + 10 = 100 → crosses silver threshold
    const member  = makeActiveMember(90, "bronze");
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(member) });

    await new ApplyPointsHandler(members, ledger, tiers, bus).execute({
      memberId: member.id.value, tenantId: TENANT_ID, delta: 10, reason: "bonus",
    });

    const upgraded = bus.captured.find(e => e.name === "TierUpgraded");
    expect(upgraded).toBeDefined();
    expect(upgraded!.payload.from).toBe("bronze");
    expect(upgraded!.payload.to).toBe("silver");
    expect(member.currentTier).toBe("silver");
  });

  it("does NOT emit TierUpgraded when tier stays the same", async () => {
    // 50 + 30 = 80 — stays bronze (threshold is 100)
    const member  = makeActiveMember(50, "bronze");
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(member) });

    await new ApplyPointsHandler(members, ledger, tiers, bus).execute({
      memberId: member.id.value, tenantId: TENANT_ID, delta: 30, reason: "purchase",
    });

    expect(bus.captured.find(e => e.name === "TierUpgraded")).toBeUndefined();
    expect(bus.captured.find(e => e.name === "PointsEarned")).toBeDefined();
  });

  it("emits TierUpgraded again when crossing a second threshold (gold)", async () => {
    // 490 + 10 = 500 → crosses gold threshold
    const member  = makeActiveMember(490, "silver");
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(member) });

    await new ApplyPointsHandler(members, ledger, tiers, bus).execute({
      memberId: member.id.value, tenantId: TENANT_ID, delta: 10, reason: "promo",
    });

    const upgraded = bus.captured.find(e => e.name === "TierUpgraded");
    expect(upgraded).toBeDefined();
    expect(upgraded!.payload.from).toBe("silver");
    expect(upgraded!.payload.to).toBe("gold");
  });

  it("persists the member after applying points", async () => {
    const member  = makeActiveMember(0);
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(member) });

    await new ApplyPointsHandler(members, ledger, tiers, bus).execute({
      memberId: member.id.value, tenantId: TENANT_ID, delta: 10, reason: "earn",
    });

    expect(members.save).toHaveBeenCalledWith(member);
  });

  it("returns NotFoundError when member does not exist", async () => {
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(null) });

    const result = await new ApplyPointsHandler(members, ledger, tiers, bus).execute({
      memberId: "no-such-member", tenantId: TENANT_ID, delta: 10, reason: "earn",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    expect(ledger.append).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("forwards optional referenceId to ledger.append", async () => {
    const member  = makeActiveMember(0);
    const members = makeMemberRepo({ findById: vi.fn().mockResolvedValue(member) });

    await new ApplyPointsHandler(members, ledger, tiers, bus).execute({
      memberId:    member.id.value,
      tenantId:    TENANT_ID,
      delta:       5,
      reason:      "scan",
      referenceId: "scan-abc-123",
    });

    const appendArg = (ledger.append as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(appendArg.referenceId).toBe("scan-abc-123");
  });
});

// ── EnrollMemberHandler ─────────────────────────────────────────────────────

describe("EnrollMemberHandler", () => {
  it("creates a new member with zero balance and bronze tier, emits MemberEnrolled", async () => {
    const members = makeMemberRepo({ findByPassId: vi.fn().mockResolvedValue(null) });
    const bus     = makeBus();

    const h      = new EnrollMemberHandler(members, bus);
    const result = await h.execute({
      passId:      PASS_ID,
      tenantId:    TENANT_ID,
      displayName: "Alice",
      email:       "alice@example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.balance).toBe(0);
    expect(result.value.currentTier).toBe("bronze");
    expect(result.value.passId).toBe(PASS_ID);
    expect(result.value.tenantId).toBe(TENANT_ID);
    expect(result.value.status).toBe("active");

    expect(members.save).toHaveBeenCalledOnce();
    const enrolled = bus.captured.find(e => e.name === "MemberEnrolled");
    expect(enrolled).toBeDefined();
    expect(enrolled!.payload.passId).toBe(PASS_ID);
    expect(enrolled!.payload.tenantId).toBe(TENANT_ID);
  });

  it("is idempotent: returns existing member without saving again", async () => {
    const existing = makeActiveMember(100, "silver");
    const members  = makeMemberRepo({ findByPassId: vi.fn().mockResolvedValue(existing) });
    const bus      = makeBus();

    const h      = new EnrollMemberHandler(members, bus);
    const result = await h.execute({ passId: PASS_ID, tenantId: TENANT_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.memberId).toBe(existing.id.value);
    expect(members.save).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("works with anonymous enrolment (no displayName or email)", async () => {
    const members = makeMemberRepo({ findByPassId: vi.fn().mockResolvedValue(null) });
    const bus     = makeBus();

    const result = await new EnrollMemberHandler(members, bus).execute({
      passId: PASS_ID, tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.displayName).toBeNull();
    expect(result.value.email).toBeNull();
  });

  it("EnrollMember on PassIssued: processes passId from the event payload", async () => {
    // Simulate the PassIssued event triggering EnrollMemberHandler.execute()
    const passIdFromEvent = "new-pass-from-event";
    const members = makeMemberRepo({ findByPassId: vi.fn().mockResolvedValue(null) });
    const bus     = makeBus();

    const h      = new EnrollMemberHandler(members, bus);
    const result = await h.execute({
      passId:   passIdFromEvent,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passId).toBe(passIdFromEvent);
    const enrolled = bus.captured.find(e => e.name === "MemberEnrolled");
    expect(enrolled!.payload.passId).toBe(passIdFromEvent);
  });
});

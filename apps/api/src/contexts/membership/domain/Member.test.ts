import { describe, it, expect } from "vitest";
import { Member } from "./Member";
import { MemberId } from "./MemberId";
import { PointsBalance } from "./PointsBalance";
import type { TierRule } from "./TierRule";

const TIERS: TierRule[] = [
  { name: "bronze", minPoints: 0 },
  { name: "silver", minPoints: 100 },
  { name: "gold", minPoints: 500 },
];

function makeActive(balance = 0, tier = "bronze"): Member {
  return Member.reconstitute({
    id: MemberId.create(),
    tenantId: "tenant-1",
    passId: "pass-1",
    displayName: null,
    email: null,
    balance: PointsBalance.of(balance),
    currentTier: tier,
    enrolledAt: new Date(),
    status: "active",
  });
}

describe("Member aggregate", () => {
  it("enrolls with zero balance and bronze tier", () => {
    const member = Member.enroll({
      id: MemberId.create(),
      tenantId: "t1",
      passId: "p1",
    });

    expect(member.balance).toBe(0);
    expect(member.currentTier).toBe("bronze");
    expect(member.status).toBe("active");

    const events = member.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("MemberEnrolled");
    expect(events[0].payload.passId).toBe("p1");
  });

  it("PointsBalance rejects negative values", () => {
    expect(() => PointsBalance.of(-1)).toThrow();
  });

  it("emits PointsEarned with correct newBalance", () => {
    const member = makeActive(50);
    member.applyPoints(30, TIERS);

    const events = member.pullEvents();
    const earned = events.find((e) => e.name === "PointsEarned");
    expect(earned).toBeDefined();
    expect(earned!.payload.newBalance).toBe(80);
    expect(member.balance).toBe(80);
  });

  it("upgrades tier and emits TierUpgraded when crossing threshold", () => {
    const member = makeActive(90);
    member.applyPoints(10, TIERS); // 90 + 10 = 100 → silver

    expect(member.currentTier).toBe("silver");

    const events = member.pullEvents();
    const upgraded = events.find((e) => e.name === "TierUpgraded");
    expect(upgraded).toBeDefined();
    expect(upgraded!.payload.from).toBe("bronze");
    expect(upgraded!.payload.to).toBe("silver");
  });

  it("does not emit TierUpgraded when tier stays the same", () => {
    const member = makeActive(50, "bronze");
    member.applyPoints(30, TIERS); // 80 - still bronze

    const events = member.pullEvents();
    expect(events.find((e) => e.name === "TierUpgraded")).toBeUndefined();
    expect(events.find((e) => e.name === "PointsEarned")).toBeDefined();
  });

  it("throws ValidationError when applying points to a deleted member", () => {
    const member = Member.reconstitute({
      id: MemberId.create(),
      tenantId: "t1",
      passId: "p1",
      displayName: null,
      email: null,
      balance: PointsBalance.of(0),
      currentTier: "bronze",
      enrolledAt: new Date(),
      status: "deleted",
    });

    expect(() => member.applyPoints(50, TIERS)).toThrow("non-active member");
  });

  it("pullEvents clears the internal event queue", () => {
    const member = makeActive(0);
    member.applyPoints(10, TIERS);
    member.pullEvents(); // first pull
    expect(member.pullEvents()).toHaveLength(0); // second pull is empty
  });
});

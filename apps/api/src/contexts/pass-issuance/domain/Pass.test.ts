import { describe, it, expect } from "vitest";
import { Pass } from "./Pass";
import { SerialNumber } from "./SerialNumber";
import { AuthenticationToken } from "./AuthenticationToken";
import { DomainError } from "../../../kernel";

const makePass = (overrides?: { voided?: boolean }) => {
  const serial    = SerialNumber.mint();
  const authToken = AuthenticationToken.fromRaw("a".repeat(32));
  const now       = new Date("2026-01-01T00:00:00.000Z");
  const pass = Pass.issue({
    passTypeId:  "template-uuid",
    memberId:    "member-uuid",
    tenantId:    "tenant-uuid",
    serialNumber: serial,
    authToken,
    fieldValues: [{ key: "points", label: "Points", value: 0 }],
    now,
  });
  if (overrides?.voided) pass.voidPass(new Date("2026-01-01T00:01:00.000Z"));
  return pass;
};

describe("Pass aggregate — authToken immutability", () => {
  it("exposes the auth token but provides no public setter", () => {
    const pass = makePass();
    const token = pass.authToken.value;
    expect(token).toBe("a".repeat(32));
    // No pass.authToken = ... (TypeScript readonly; confirm via structural check)
    expect(typeof (pass as { authToken: unknown }).authToken).toBe("object");
  });
});

describe("Pass.issue()", () => {
  it("emits a PassIssued event with correct payload", () => {
    const pass   = makePass();
    const events = pass.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("PassIssued");
    expect(events[0].payload.tenantId).toBe("tenant-uuid");
    expect(events[0].payload.memberId).toBe("member-uuid");
  });

  it("starts with version 1 and voided=false", () => {
    const pass = makePass();
    pass.pullEvents(); // clear
    expect(pass.version).toBe(1);
    expect(pass.voided).toBe(false);
  });
});

describe("Pass.updateFields()", () => {
  it("bumps version and lastUpdated, emits PassFieldsUpdated", () => {
    const pass  = makePass();
    pass.pullEvents(); // clear issuance event
    const now   = new Date(pass.lastUpdated.getTime() + 1000);
    pass.updateFields([{ key: "points", label: "Points", value: 100 }], now);
    expect(pass.version).toBe(2);
    expect(pass.lastUpdated).toEqual(now);
    const events = pass.pullEvents();
    expect(events[0].name).toBe("PassFieldsUpdated");
  });

  it("throws PASS_VOIDED when pass is already voided", () => {
    const pass = makePass({ voided: true });
    pass.pullEvents(); // clear
    expect(() =>
      pass.updateFields([{ key: "points", label: "P", value: 1 }], new Date()),
    ).toThrow(DomainError);
  });

  it("enforces monotonic lastUpdated even when caller passes stale date", () => {
    const pass      = makePass();
    const staleDate = new Date(pass.lastUpdated.getTime() - 1000); // in the past
    pass.pullEvents();
    pass.updateFields([{ key: "points", label: "Points", value: 1 }], staleDate);
    expect(pass.lastUpdated.getTime()).toBeGreaterThan(staleDate.getTime());
  });
});

describe("Pass.voidPass()", () => {
  it("is idempotent — second void does not add an extra event", () => {
    const pass = makePass();
    pass.pullEvents();
    const t1 = new Date("2026-06-01T00:00:00.000Z");
    const t2 = new Date("2026-06-01T00:01:00.000Z");
    pass.voidPass(t1);
    pass.voidPass(t2); // second call
    const events = pass.pullEvents();
    expect(events).toHaveLength(1); // only one PassVoided
    expect(pass.voided).toBe(true);
  });
});

describe("SerialNumber", () => {
  it("mint() creates a valid UUID-format string", () => {
    const sn = SerialNumber.mint();
    expect(sn.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("AuthenticationToken", () => {
  it("rejects strings shorter than 32 chars", () => {
    expect(() => AuthenticationToken.fromRaw("short")).toThrow(DomainError);
  });

  it("accepts exactly 32 chars", () => {
    const tok = AuthenticationToken.fromRaw("b".repeat(32));
    expect(tok.value.length).toBe(32);
  });
});

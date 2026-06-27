import { describe, it, expect } from "vitest";
import { AcceptInvitationHandler } from "../AcceptInvitationHandler";
import type { IInvitationRepository, IIdentityTxRunner } from "../ports";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";
import { NotFoundError, ValidationError } from "../../../../kernel";
import { Invitation } from "../../domain/Invitation";

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

const HMAC_SECRET = "test-secret-for-accept-invitation!!";
const TENANT_ID = "tenant-accept-test";
const INVITE_EMAIL = "staff@acme.com";
const PASSWORD = "P@ssw0rd-long!";

/** Returns a real domain Invitation + the raw token for use in test inputs. */
function makeValidPair(): { invitation: Invitation; rawToken: string } {
  return Invitation.create({
    tenantId: TENANT_ID,
    email: INVITE_EMAIL,
    role: "staff",
    invitedBy: "owner-id",
    hmacSecret: HMAC_SECRET,
  });
}

function makeBus(): DomainEventBus & { published: DomainEvent[] } {
  const published: DomainEvent[] = [];
  return {
    published,
    async publish(events) { published.push(...events); },
    subscribe() {},
  };
}

/**
 * Fake repo that returns the given invitation regardless of the tokenHash
 * (the handler looks it up by hash — for the "valid" and "expired/used" paths
 * the invitation's own tokenHash will match or mismatch in verifyToken).
 */
function makeInvitationRepo(invitation: Invitation | null): IInvitationRepository {
  return {
    async findByTokenHash() { return invitation; },
    async findPendingByEmail() { return null; },
    async save() {},
    async markUsed() {},
  };
}

function makeTxRunner(): IIdentityTxRunner {
  return {
    async signUpTx() {},
    async acceptInvitationTx() {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AcceptInvitationHandler", () => {
  it("happy path: creates user, emits UserActivated, returns role + tenantId", async () => {
    const { invitation, rawToken } = makeValidPair();
    const bus = makeBus();
    const handler = new AcceptInvitationHandler(
      makeInvitationRepo(invitation),
      makeTxRunner(),
      bus
    );

    const result = await handler.execute({
      token: rawToken,
      password: PASSWORD,
      hmacSecret: HMAC_SECRET,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe(INVITE_EMAIL);
    expect(result.value.role).toBe("staff");
    expect(result.value.tenantId).toBe(TENANT_ID);
    expect(result.value.userId).toBeTruthy();

    const activated = bus.published.find(e => e.name === "UserActivated");
    expect(activated).toBeDefined();
    expect(activated?.payload.role).toBe("staff");
  });

  it("returns NotFoundError when no invitation matches the derived token hash", async () => {
    const bus = makeBus();
    const handler = new AcceptInvitationHandler(makeInvitationRepo(null), makeTxRunner(), bus);

    const result = await handler.execute({
      token: "completely-made-up-token",
      password: PASSWORD,
      hmacSecret: HMAC_SECRET,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(bus.published).toHaveLength(0);
  });

  it("returns ValidationError for a tampered token (verifyToken timing-safe compare fails)", async () => {
    // The fake repo returns the real invitation but the input token doesn't match its hash.
    const { invitation } = makeValidPair();
    const bus = makeBus();
    const handler = new AcceptInvitationHandler(
      makeInvitationRepo(invitation),
      makeTxRunner(),
      bus
    );

    const result = await handler.execute({
      token: "tampered-token-that-does-not-match",
      password: PASSWORD,
      hmacSecret: HMAC_SECRET,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toContain("Invalid invitation token");
    expect(bus.published).toHaveLength(0);
  });

  it("returns ValidationError for an expired invitation", async () => {
    const { invitation: base, rawToken } = makeValidPair();
    // Reconstitute with expiresAt in the past so consume() throws
    const expired = Invitation.reconstitute(base.id.value, {
      tenantId: TENANT_ID,
      email: INVITE_EMAIL,
      role: "staff",
      tokenHash: base.tokenHash,
      expiresAt: new Date(Date.now() - 1_000),
      invitedBy: "owner-id",
      usedAt: null,
      createdAt: new Date(),
    });
    const bus = makeBus();
    const handler = new AcceptInvitationHandler(
      makeInvitationRepo(expired),
      makeTxRunner(),
      bus
    );

    const result = await handler.execute({
      token: rawToken,
      password: PASSWORD,
      hmacSecret: HMAC_SECRET,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toContain("expired");
    expect(bus.published).toHaveLength(0);
  });

  it("returns ValidationError for an already-used invitation", async () => {
    const { invitation: base, rawToken } = makeValidPair();
    // Reconstitute with usedAt already set so consume() throws
    const used = Invitation.reconstitute(base.id.value, {
      tenantId: TENANT_ID,
      email: INVITE_EMAIL,
      role: "staff",
      tokenHash: base.tokenHash,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1_000),
      invitedBy: "owner-id",
      usedAt: new Date(Date.now() - 500),
      createdAt: new Date(),
    });
    const bus = makeBus();
    const handler = new AcceptInvitationHandler(
      makeInvitationRepo(used),
      makeTxRunner(),
      bus
    );

    const result = await handler.execute({
      token: rawToken,
      password: PASSWORD,
      hmacSecret: HMAC_SECRET,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toContain("already been used");
    expect(bus.published).toHaveLength(0);
  });
});

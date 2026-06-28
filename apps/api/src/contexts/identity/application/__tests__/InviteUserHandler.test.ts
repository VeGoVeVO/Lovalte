import { describe, it, expect } from "vitest";
import { InviteUserHandler } from "../InviteUserHandler";
import type { IUserRepository, IInvitationRepository } from "../ports";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";
import { ConflictError } from "../../../../kernel";
import { User } from "../../domain/User";
import { Email } from "../../domain/Email";
import { PasswordHash } from "../../domain/PasswordHash";
import { Invitation } from "../../domain/Invitation";

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

const TENANT_ID = "tenant-invite-test";
const INVITER_ID = "owner-user-id";
const HMAC_SECRET = "test-secret-for-invite-handler-tests!!";
const INVITE_EMAIL = "staff@acme.com";

function makeBus(): DomainEventBus & { published: DomainEvent[] } {
  const published: DomainEvent[] = [];
  return {
    published,
    async publish(events) {
      published.push(...events);
    },
    subscribe() {},
  };
}

function makeUserRepo(existing: User | null = null): IUserRepository {
  return {
    async findByEmail() {
      return existing;
    },
    async findById() {
      return null;
    },
    async findAllByTenant() {
      return [];
    },
    async save() {},
  };
}

function makeInvitationRepo(pending: Invitation | null = null): IInvitationRepository {
  return {
    async findByTokenHash() {
      return null;
    },
    async findPendingByEmail() {
      return pending;
    },
    async save() {},
    async markUsed() {},
  };
}

const BASE_INPUT = {
  tenantId: TENANT_ID,
  email: INVITE_EMAIL,
  role: "staff" as const,
  invitedBy: INVITER_ID,
  hmacSecret: HMAC_SECRET,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InviteUserHandler", () => {
  it("happy path: creates and saves invitation, returns token, emits UserInvited", async () => {
    const bus = makeBus();
    const handler = new InviteUserHandler(makeUserRepo(null), makeInvitationRepo(null), bus);

    const result = await handler.execute(BASE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe(INVITE_EMAIL);
    expect(result.value.role).toBe("staff");
    expect(result.value.token).toBeTruthy();
    expect(result.value.invitationId).toBeTruthy();
    expect(result.value.expiresAt).toBeTruthy();

    const event = bus.published.find((e) => e.name === "UserInvited");
    expect(event).toBeDefined();
    expect(event?.payload.email).toBe(INVITE_EMAIL);
    expect(event?.payload.tenantId).toBe(TENANT_ID);
    expect(event?.payload.invitedBy).toBe(INVITER_ID);
  });

  it("normalises the email to lowercase before checking for duplicates", async () => {
    const bus = makeBus();
    const handler = new InviteUserHandler(makeUserRepo(null), makeInvitationRepo(null), bus);

    const result = await handler.execute({ ...BASE_INPUT, email: "STAFF@ACME.COM" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe(INVITE_EMAIL);
  });

  it("returns ConflictError when a user with that email already exists in the tenant", async () => {
    const existingUser = User.reconstitute("u-existing", {
      tenantId: TENANT_ID,
      email: Email.fromStored(INVITE_EMAIL),
      passwordHash: PasswordHash.hash("some-long-pass"),
      role: "staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const bus = makeBus();
    const handler = new InviteUserHandler(
      makeUserRepo(existingUser),
      makeInvitationRepo(null),
      bus,
    );

    const result = await handler.execute(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConflictError);
    expect(result.error.message).toContain("already exists");
    expect(bus.published).toHaveLength(0);
  });

  it("returns ConflictError when a pending invitation already exists for the email", async () => {
    const { invitation } = Invitation.create({
      tenantId: TENANT_ID,
      email: INVITE_EMAIL,
      role: "staff",
      invitedBy: INVITER_ID,
      hmacSecret: HMAC_SECRET,
    });
    const bus = makeBus();
    const handler = new InviteUserHandler(makeUserRepo(null), makeInvitationRepo(invitation), bus);

    const result = await handler.execute(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConflictError);
    expect(result.error.message).toContain("pending invitation");
    expect(bus.published).toHaveLength(0);
  });
});

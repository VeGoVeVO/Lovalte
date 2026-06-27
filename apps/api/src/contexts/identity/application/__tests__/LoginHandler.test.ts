import { describe, it, expect } from "vitest";
import { LoginHandler } from "../LoginHandler";
import type { ITenantRepository, IUserRepository } from "../ports";
import { UnauthorizedError } from "../../../../kernel";
import { Tenant } from "../../domain/Tenant";
import { Slug } from "../../domain/Slug";
import { User } from "../../domain/User";
import { Email } from "../../domain/Email";
import { PasswordHash } from "../../domain/PasswordHash";

const TENANT_ID = "tenant-login-test";
const SLUG = "acme";
const EMAIL = "owner@acme.com";
const PASSWORD = "P@ssw0rd-long!";

function makeTenant(status: "active" | "suspended"): Tenant {
  return Tenant.reconstitute(TENANT_ID, {
    name: "Acme",
    slug: Slug.fromStored(SLUG),
    status,
    plan: "trial",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeUser(status: "active" | "invited"): User {
  return User.reconstitute("user-login-test", {
    tenantId: TENANT_ID,
    email: Email.fromStored(EMAIL),
    passwordHash: PasswordHash.hash(PASSWORD),
    role: "owner",
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function tenantRepo(tenant: Tenant | null): ITenantRepository {
  return {
    async findBySlug() { return tenant; },
    async findById() { return tenant; },
    async save() {},
  };
}

function userRepo(user: User | null): IUserRepository {
  return {
    async findByEmail() { return user; },
    async findByEmailGlobal() { return user; },
    async findById() { return user; },
    async findAllByTenant() { return user ? [user] : []; },
    async save() {},
  };
}

describe("LoginHandler", () => {
  it("happy path by email only (no slug)", async () => {
    const handler = new LoginHandler(tenantRepo(makeTenant("active")), userRepo(makeUser("active")));
    const r = await handler.execute({ email: EMAIL, password: PASSWORD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe(EMAIL);
    expect(r.value.role).toBe("owner");
    expect(r.value.tenantId).toBe(TENANT_ID);
  });

  it("happy path with an explicit slug", async () => {
    const handler = new LoginHandler(tenantRepo(makeTenant("active")), userRepo(makeUser("active")));
    const r = await handler.execute({ email: EMAIL, password: PASSWORD, slug: SLUG });
    expect(r.ok).toBe(true);
  });

  it("unknown email -> generic Invalid credentials (prevents enumeration)", async () => {
    const handler = new LoginHandler(tenantRepo(makeTenant("active")), userRepo(null));
    const r = await handler.execute({ email: "nobody@acme.com", password: PASSWORD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(UnauthorizedError);
    expect(r.error.message).toBe("Invalid credentials");
  });

  it("wrong password -> Invalid credentials", async () => {
    const handler = new LoginHandler(tenantRepo(makeTenant("active")), userRepo(makeUser("active")));
    const r = await handler.execute({ email: EMAIL, password: "wrong-password!" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(UnauthorizedError);
    expect(r.error.message).toBe("Invalid credentials");
  });

  it("suspended tenant -> not active", async () => {
    const handler = new LoginHandler(tenantRepo(makeTenant("suspended")), userRepo(makeUser("active")));
    const r = await handler.execute({ email: EMAIL, password: PASSWORD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(UnauthorizedError);
    expect(r.error.message).toContain("not active");
  });

  it("inactive (invited) user -> not active", async () => {
    const handler = new LoginHandler(tenantRepo(makeTenant("active")), userRepo(makeUser("invited")));
    const r = await handler.execute({ email: EMAIL, password: PASSWORD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(UnauthorizedError);
    expect(r.error.message).toContain("not active");
  });
});

import { describe, it, expect } from "vitest";
import { UnauthorizedError } from "../../../../kernel";
import { Email } from "../../domain/Email";
import { PasswordHash } from "../../domain/PasswordHash";
import { Slug } from "../../domain/Slug";
import { Tenant } from "../../domain/Tenant";
import { User } from "../../domain/User";
import { LoginWithAppleHandler } from "../LoginWithAppleHandler";
import type { ITenantRepository, IUserRepository } from "../ports";

const TENANT_ID = "tenant-apple-login-test";
const EMAIL = "owner@acme.com";

function makeTenant(status: "active" | "suspended" = "active"): Tenant {
  return Tenant.reconstitute(TENANT_ID, {
    name: "Acme",
    slug: Slug.fromStored("acme"),
    status,
    plan: "trial",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeUser(status: "active" | "invited" = "active"): User {
  return User.reconstitute("user-apple-login-test", {
    tenantId: TENANT_ID,
    email: Email.fromStored(EMAIL),
    passwordHash: PasswordHash.hash("not-used-for-apple-login"),
    role: "owner",
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function tenantRepo(tenant: Tenant | null): ITenantRepository {
  return {
    async findBySlug() {
      return tenant;
    },
    async findById() {
      return tenant;
    },
    async save() {},
    async deleteRoot() {},
  };
}

function userRepo(user: User | null): IUserRepository {
  return {
    async findByEmail() {
      return user;
    },
    async findByEmailGlobal() {
      return user;
    },
    async findById() {
      return user;
    },
    async findAllByTenant() {
      return user ? [user] : [];
    },
    async save() {},
  };
}

describe("LoginWithAppleHandler", () => {
  it("authenticates an active existing user by verified Apple email", async () => {
    const handler = new LoginWithAppleHandler(tenantRepo(makeTenant()), userRepo(makeUser()));

    const result = await handler.execute({ email: EMAIL });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe(EMAIL);
    expect(result.value.tenantId).toBe(TENANT_ID);
    expect(result.value.role).toBe("owner");
  });

  it("rejects unknown Apple emails", async () => {
    const handler = new LoginWithAppleHandler(tenantRepo(makeTenant()), userRepo(null));

    const result = await handler.execute({ email: "missing@acme.com" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(UnauthorizedError);
  });

  it("rejects inactive users", async () => {
    const handler = new LoginWithAppleHandler(tenantRepo(makeTenant()), userRepo(makeUser("invited")));

    const result = await handler.execute({ email: EMAIL });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("not active");
  });
});

import { describe, it, expect } from "vitest";
import { ConflictError } from "../../../../kernel";
import type { DomainEvent, DomainEventBus } from "../../../../kernel";
import { Slug } from "../../domain/Slug";
import { Tenant } from "../../domain/Tenant";
import { SignUpTenantWithAppleHandler } from "../SignUpTenantWithAppleHandler";
import type { IIdentityTxRunner, ITenantRepository } from "../ports";

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

function makeTenantsRepo(existing: Tenant | null = null): ITenantRepository {
  return {
    async findBySlug() {
      return existing;
    },
    async findById() {
      return existing;
    },
    async save() {},
    async deleteRoot() {},
  };
}

function makeTxRunner(): IIdentityTxRunner {
  return {
    async signUpTx() {},
    async acceptInvitationTx() {},
  };
}

describe("SignUpTenantWithAppleHandler", () => {
  it("creates a tenant owner using a verified Apple email", async () => {
    const bus = makeBus();
    const handler = new SignUpTenantWithAppleHandler(makeTenantsRepo(), makeTxRunner(), bus);

    const result = await handler.execute({
      email: "OWNER@ACME.COM",
      businessName: "Acme Corp",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe("owner@acme.com");
    expect(result.value.tenantId).toBeTruthy();
    expect(result.value.userId).toBeTruthy();
    expect(bus.published.some((event) => event.name === "TenantCreated")).toBe(true);
  });

  it("returns ConflictError when the derived slug is already taken", async () => {
    const existing = Tenant.reconstitute("tenant-existing", {
      name: "Existing",
      slug: Slug.fromStored("acme-corp"),
      status: "active",
      plan: "trial",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const handler = new SignUpTenantWithAppleHandler(makeTenantsRepo(existing), makeTxRunner(), makeBus());

    const result = await handler.execute({
      email: "owner@acme.com",
      businessName: "Acme Corp",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConflictError);
  });
});

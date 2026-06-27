import { describe, it, expect } from "vitest";
import { SignUpTenantHandler } from "../SignUpTenantHandler";
import type { ITenantRepository, IIdentityTxRunner } from "../ports";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";
import { ConflictError } from "../../../../kernel";
import { Tenant } from "../../domain/Tenant";
import { Slug } from "../../domain/Slug";

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

function makeBus(): DomainEventBus & { published: DomainEvent[] } {
  const published: DomainEvent[] = [];
  return {
    published,
    async publish(events) { published.push(...events); },
    subscribe() {},
  };
}

function makeTenantsRepo(existing: Tenant | null = null): ITenantRepository {
  return {
    async findBySlug() { return existing; },
    async save() {},
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

const VALID_INPUT = {
  email: "owner@acme.com",
  password: "P@ssw0rd-long!",
  businessName: "Acme Corp",
};

describe("SignUpTenantHandler", () => {
  it("happy path: creates tenant + owner, returns ids and email, emits TenantCreated", async () => {
    const bus = makeBus();
    const handler = new SignUpTenantHandler(makeTenantsRepo(null), makeTxRunner(), bus);

    const result = await handler.execute(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe("owner@acme.com");
    expect(result.value.tenantId).toBeTruthy();
    expect(result.value.userId).toBeTruthy();

    const tenantCreated = bus.published.find(e => e.name === "TenantCreated");
    expect(tenantCreated).toBeDefined();
    expect(tenantCreated?.payload.name).toBe("Acme Corp");
    expect(tenantCreated?.payload.slug).toBe("acme-corp");
  });

  it("returns ConflictError when the derived slug is already taken", async () => {
    const existing = Tenant.reconstitute("t-existing", {
      name: "Existing Co",
      slug: Slug.fromStored("acme-corp"),
      status: "active",
      plan: "trial",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const bus = makeBus();
    const handler = new SignUpTenantHandler(makeTenantsRepo(existing), makeTxRunner(), bus);

    const result = await handler.execute(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConflictError);
    expect(bus.published).toHaveLength(0);
  });

  it("returns ValidationError when the email address is malformed", async () => {
    const bus = makeBus();
    const handler = new SignUpTenantHandler(makeTenantsRepo(null), makeTxRunner(), bus);

    const result = await handler.execute({ ...VALID_INPUT, email: "not-an-email" });

    expect(result.ok).toBe(false);
    expect(bus.published).toHaveLength(0);
  });

  it("txRunner.signUpTx is called with the new tenant and owner on success", async () => {
    let capturedTenant: Tenant | undefined;
    const txRunner: IIdentityTxRunner = {
      async signUpTx(tenant) { capturedTenant = tenant; },
      async acceptInvitationTx() {},
    };
    const handler = new SignUpTenantHandler(makeTenantsRepo(null), txRunner, makeBus());

    const result = await handler.execute(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(capturedTenant).toBeDefined();
    expect(capturedTenant?.name).toBe("Acme Corp");
  });
});

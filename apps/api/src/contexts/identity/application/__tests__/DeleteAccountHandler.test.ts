import { describe, it, expect } from "vitest";
import { DeleteAccountHandler } from "../DeleteAccountHandler";
import type { ITenantRepository } from "../ports";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";
import { NotFoundError } from "../../../../kernel";
import { Tenant } from "../../domain/Tenant";
import { Slug } from "../../domain/Slug";

const TID = "11111111-1111-1111-1111-111111111111";

function makeTenant(id: string): Tenant {
  return Tenant.reconstitute(id, {
    name: "Acme",
    slug: Slug.fromStored("acme"),
    status: "active",
    plan: "trial",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeBus(order: string[]): DomainEventBus & { published: DomainEvent[] } {
  const published: DomainEvent[] = [];
  return {
    published,
    async publish(events) {
      published.push(...events);
      order.push("publish");
    },
    subscribe() {},
  };
}

describe("DeleteAccountHandler", () => {
  it("publishes TenantDeleted, then drops the tenant root (purge before root)", async () => {
    const order: string[] = [];
    const bus = makeBus(order);
    let deletedRoot: string | null = null;
    const repo: ITenantRepository = {
      async findBySlug() {
        return null;
      },
      async findById() {
        return makeTenant(TID);
      },
      async save() {},
      async deleteRoot(tenantId) {
        deletedRoot = tenantId;
        order.push("deleteRoot");
      },
    };

    const result = await new DeleteAccountHandler(repo, bus).execute({ tenantId: TID });

    expect(result.ok).toBe(true);
    expect(bus.published.map((e) => e.name)).toEqual(["TenantDeleted"]);
    expect(bus.published[0].payload.tenantId).toBe(TID);
    expect(deletedRoot).toBe(TID);
    // Subscribers must purge their own data BEFORE the root row is dropped.
    expect(order).toEqual(["publish", "deleteRoot"]);
  });

  it("returns NotFoundError and never publishes/deletes when the tenant is missing", async () => {
    const order: string[] = [];
    const bus = makeBus(order);
    const repo: ITenantRepository = {
      async findBySlug() {
        return null;
      },
      async findById() {
        return null;
      },
      async save() {},
      async deleteRoot() {
        throw new Error("deleteRoot must not be called for a missing tenant");
      },
    };

    const result = await new DeleteAccountHandler(repo, bus).execute({ tenantId: "nope" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(bus.published).toHaveLength(0);
    expect(order).toEqual([]);
  });
});

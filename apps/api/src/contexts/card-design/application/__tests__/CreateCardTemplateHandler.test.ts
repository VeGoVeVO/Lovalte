import { describe, it, expect } from "vitest";
import { CreateCardTemplateHandler } from "../CreateCardTemplateHandler";
import type { ICardTemplateRepository } from "../ICardTemplateRepository";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";
import { ValidationError } from "../../../../kernel";
import type { CreateCardTemplateInput } from "../dtos";
import type { CardTemplate } from "../../domain/CardTemplate";

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

const TENANT_ID = "tenant-create-cd-test";

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

function makeRepo(): ICardTemplateRepository & { store: Map<string, CardTemplate> } {
  const store = new Map<string, CardTemplate>();
  return {
    store,
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findAllByTenant() {
      return [...store.values()];
    },
    async save(t) {
      store.set(t.id.value, t);
    },
    async registerAsset(a) {
      return { ...a, id: "asset-id", createdAt: new Date() };
    },
    async findAssetsByTemplate() {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Shared valid input
// ---------------------------------------------------------------------------

const VALID_INPUT: CreateCardTemplateInput = {
  tenantId: TENANT_ID,
  name: "Gold Card",
  organizationName: "Acme Loyalty",
  backgroundColor: "rgb(0, 0, 0)",
  foregroundColor: "rgb(255, 255, 255)",
  headerFields: [],
  primaryFields: [{ key: "points", label: "Points", valueTemplate: "{{points}}" }],
  secondaryFields: [],
  auxiliaryFields: [],
  backFields: [],
  pointsPerVisit: 1,
  rewardThreshold: 10,
  tierRules: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreateCardTemplateHandler", () => {
  it("happy path: creates a draft template, persists it, emits CardTemplateCreated", async () => {
    const repo = makeRepo();
    const bus = makeBus();
    const handler = new CreateCardTemplateHandler(repo, bus);

    const result = await handler.execute(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tenantId).toBe(TENANT_ID);
    expect(result.value.status).toBe("draft");
    expect(result.value.version).toBe(0);
    expect(result.value.name).toBe("Gold Card");
    expect(result.value.rewardRule.pointsPerVisit).toBe(1);

    // Persisted in the fake repo
    expect(repo.store.size).toBe(1);

    // Event published
    const event = bus.published.find((e) => e.name === "CardTemplateCreated");
    expect(event).toBeDefined();
    expect(event?.payload.tenantId).toBe(TENANT_ID);
  });

  it("returns ValidationError when backgroundColor is a hex string", async () => {
    const bus = makeBus();
    const handler = new CreateCardTemplateHandler(makeRepo(), bus);

    const result = await handler.execute({ ...VALID_INPUT, backgroundColor: "#ff0000" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toContain("rgb(");
    expect(bus.published).toHaveLength(0);
  });

  it("returns ValidationError when foregroundColor is a hex string", async () => {
    const bus = makeBus();
    const handler = new CreateCardTemplateHandler(makeRepo(), bus);

    const result = await handler.execute({ ...VALID_INPUT, foregroundColor: "#ffffff" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(bus.published).toHaveLength(0);
  });

  it("returns ValidationError when pointsPerVisit is zero", async () => {
    const bus = makeBus();
    const handler = new CreateCardTemplateHandler(makeRepo(), bus);

    const result = await handler.execute({ ...VALID_INPUT, pointsPerVisit: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.message).toContain("pointsPerVisit");
    expect(bus.published).toHaveLength(0);
  });

  it("returns DomainError when organizationName is empty", async () => {
    const bus = makeBus();
    const handler = new CreateCardTemplateHandler(makeRepo(), bus);

    const result = await handler.execute({ ...VALID_INPUT, organizationName: "" });

    expect(result.ok).toBe(false);
    expect(bus.published).toHaveLength(0);
  });
});

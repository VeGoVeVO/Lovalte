import { describe, it, expect } from "vitest";
import { UpdateCardTemplateHandler } from "../UpdateCardTemplateHandler";
import type { ICardTemplateRepository } from "../ICardTemplateRepository";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";
import { NotFoundError, DomainError, ValidationError } from "../../../../kernel";
import { CardTemplate, CardTemplateId } from "../../domain/CardTemplate";
import { BrandConfig } from "../../domain/BrandConfig";
import { RewardRule } from "../../domain/RewardRule";
import { RgbColor } from "../../domain/RgbColor";
import type { UpdateCardTemplateInput } from "../dtos";

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

const TENANT_ID = "tenant-update-cd-test";
const TEMPLATE_ID = "tmpl-update-1";

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

function makeMinimalBrand(
  overrides: Partial<ConstructorParameters<typeof BrandConfig>[0]> = {},
): BrandConfig {
  return new BrandConfig({
    organizationName: "Acme",
    backgroundColor: RgbColor.create(0, 0, 0),
    foregroundColor: RgbColor.create(255, 255, 255),
    headerFields: [],
    primaryFields: [{ key: "pts", label: "Pts", valueTemplate: "{{points}}" }],
    secondaryFields: [],
    auxiliaryFields: [],
    backFields: [],
    ...overrides,
  });
}

function makeDraftTemplate(): CardTemplate {
  return CardTemplate.reconstitute(CardTemplateId.of(TEMPLATE_ID), {
    tenantId: TENANT_ID,
    name: "Draft Card",
    status: "draft",
    version: 0,
    brand: makeMinimalBrand(),
    rewardRule: new RewardRule(1, 10, []),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makePublishedTemplate(): CardTemplate {
  return CardTemplate.reconstitute(CardTemplateId.of(TEMPLATE_ID), {
    tenantId: TENANT_ID,
    name: "Published Card",
    status: "published",
    version: 1,
    brand: makeMinimalBrand({ iconRef: "s3://bucket/icon.png" }),
    rewardRule: new RewardRule(1, 10, []),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeRepo(template: CardTemplate | null): ICardTemplateRepository {
  return {
    async findById() {
      return template;
    },
    async findAllByTenant() {
      return template ? [template] : [];
    },
    async save() {},
    async registerAsset(a) {
      return { ...a, id: "asset-id", createdAt: new Date() };
    },
    async findAssetsByTemplate() {
      return [];
    },
  };
}

const UPDATE_INPUT: UpdateCardTemplateInput = {
  templateId: TEMPLATE_ID,
  tenantId: TENANT_ID,
  name: "Gold Card v2",
  organizationName: "Acme Loyalty",
  backgroundColor: "rgb(10, 20, 30)",
  foregroundColor: "rgb(255, 255, 255)",
  headerFields: [],
  primaryFields: [{ key: "points", label: "Points", valueTemplate: "{{points}}" }],
  secondaryFields: [],
  auxiliaryFields: [],
  backFields: [],
  pointsPerVisit: 2,
  rewardThreshold: 20,
  tierRules: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UpdateCardTemplateHandler", () => {
  it("happy path: updates draft template brand + rule, emits CardTemplateSaved", async () => {
    const bus = makeBus();
    const handler = new UpdateCardTemplateHandler(makeRepo(makeDraftTemplate()), bus);

    const result = await handler.execute(UPDATE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Gold Card v2");
    expect(result.value.rewardRule.pointsPerVisit).toBe(2);
    expect(result.value.rewardRule.rewardThreshold).toBe(20);
    expect(result.value.status).toBe("draft");

    const saved = bus.published.find((e) => e.name === "CardTemplateSaved");
    expect(saved).toBeDefined();
    expect(saved?.payload.tenantId).toBe(TENANT_ID);
  });

  it("returns NotFoundError when the template does not exist", async () => {
    const bus = makeBus();
    const handler = new UpdateCardTemplateHandler(makeRepo(null), bus);

    const result = await handler.execute(UPDATE_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(bus.published).toHaveLength(0);
  });

  it("returns DomainError with code TEMPLATE_NOT_DRAFT when updating a published template", async () => {
    const bus = makeBus();
    const handler = new UpdateCardTemplateHandler(makeRepo(makePublishedTemplate()), bus);

    const result = await handler.execute(UPDATE_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(DomainError);
    expect((result.error as DomainError).code).toBe("TEMPLATE_NOT_DRAFT");
    expect(bus.published).toHaveLength(0);
  });

  it("returns ValidationError when a hex color is supplied in the update input", async () => {
    const bus = makeBus();
    const handler = new UpdateCardTemplateHandler(makeRepo(makeDraftTemplate()), bus);

    const result = await handler.execute({ ...UPDATE_INPUT, backgroundColor: "#aabbcc" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(bus.published).toHaveLength(0);
  });
});

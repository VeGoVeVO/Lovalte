import { describe, it, expect } from "vitest";
import { PublishCardTemplateHandler } from "../PublishCardTemplateHandler";
import type { ICardTemplateRepository } from "../ICardTemplateRepository";
import type { DomainEventBus, DomainEvent } from "../../../../kernel";
import { NotFoundError, DomainError } from "../../../../kernel";
import { CardTemplate, CardTemplateId } from "../../domain/CardTemplate";
import { BrandConfig } from "../../domain/BrandConfig";
import { RewardRule } from "../../domain/RewardRule";
import { RgbColor } from "../../domain/RgbColor";

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

const TENANT_ID = "tenant-publish-cd-test";
const TEMPLATE_ID = "tmpl-publish-1";

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

function makeBaseProps() {
  return {
    tenantId: TENANT_ID,
    name: "Ready Card",
    status: "draft" as const,
    version: 0,
    rewardRule: new RewardRule(1, 10, []),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Draft with all required fields: 1 primaryField + iconRef. */
function makePublishableTemplate(): CardTemplate {
  return CardTemplate.reconstitute(CardTemplateId.of(TEMPLATE_ID), {
    ...makeBaseProps(),
    brand: new BrandConfig({
      organizationName: "Acme",
      backgroundColor: RgbColor.create(0, 0, 0),
      foregroundColor: RgbColor.create(255, 255, 255),
      headerFields: [],
      primaryFields: [{ key: "pts", label: "Pts", valueTemplate: "{{points}}" }],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: [],
      iconRef: "s3://bucket/icon.png",
    }),
  });
}

/** Draft missing iconRef - BrandConfig.validate() rejects this. */
function makeTemplateWithoutIcon(): CardTemplate {
  return CardTemplate.reconstitute(CardTemplateId.of(TEMPLATE_ID), {
    ...makeBaseProps(),
    brand: new BrandConfig({
      organizationName: "Acme",
      backgroundColor: RgbColor.create(0, 0, 0),
      foregroundColor: RgbColor.create(255, 255, 255),
      headerFields: [],
      primaryFields: [{ key: "pts", label: "Pts", valueTemplate: "{{points}}" }],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: [],
      // iconRef intentionally omitted
    }),
  });
}

/** Draft with 0 primaryFields - VALID (stamp cards show the count below the strip). */
function makeTemplateWithNoPrimaryFields(): CardTemplate {
  return CardTemplate.reconstitute(CardTemplateId.of(TEMPLATE_ID), {
    ...makeBaseProps(),
    brand: new BrandConfig({
      organizationName: "Acme",
      backgroundColor: RgbColor.create(0, 0, 0),
      foregroundColor: RgbColor.create(255, 255, 255),
      headerFields: [],
      primaryFields: [], // valid: a storeCard may carry 0 primary fields
      secondaryFields: [{ key: "points", label: "STAMPS", valueTemplate: "{{points}}" }],
      auxiliaryFields: [],
      backFields: [],
      iconRef: "s3://bucket/icon.png",
    }),
  });
}

/** Draft with 2 primaryFields - validate() enforces ≤ 1. */
function makeTemplateWithTooManyPrimaries(): CardTemplate {
  return CardTemplate.reconstitute(CardTemplateId.of(TEMPLATE_ID), {
    ...makeBaseProps(),
    brand: new BrandConfig({
      organizationName: "Acme",
      backgroundColor: RgbColor.create(0, 0, 0),
      foregroundColor: RgbColor.create(255, 255, 255),
      headerFields: [],
      primaryFields: [
        { key: "a", label: "A", valueTemplate: "{{a}}" },
        { key: "b", label: "B", valueTemplate: "{{b}}" },
      ],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: [],
      iconRef: "s3://bucket/icon.png",
    }),
  });
}

/** Draft with 4 headerFields - validate() enforces ≤ 3. */
function makeTemplateWithTooManyHeaders(): CardTemplate {
  const fields = [1, 2, 3, 4].map((n) => ({
    key: `h${n}`,
    label: `H${n}`,
    valueTemplate: `{{h${n}}}`,
  }));
  return CardTemplate.reconstitute(CardTemplateId.of(TEMPLATE_ID), {
    ...makeBaseProps(),
    brand: new BrandConfig({
      organizationName: "Acme",
      backgroundColor: RgbColor.create(0, 0, 0),
      foregroundColor: RgbColor.create(255, 255, 255),
      headerFields: fields, // 4 - violates Apple Wallet ≤ 3
      primaryFields: [{ key: "pts", label: "Pts", valueTemplate: "{{points}}" }],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: [],
      iconRef: "s3://bucket/icon.png",
    }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PublishCardTemplateHandler", () => {
  it("happy path: publishes draft, increments version to 1, emits CardTemplatePublished", async () => {
    const bus = makeBus();
    const handler = new PublishCardTemplateHandler(makeRepo(makePublishableTemplate()), bus);

    const result = await handler.execute({ templateId: TEMPLATE_ID, tenantId: TENANT_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("published");
    expect(result.value.version).toBe(1);
    expect(result.value.id).toBe(TEMPLATE_ID);

    const event = bus.published.find((e) => e.name === "CardTemplatePublished");
    expect(event).toBeDefined();
    expect(event?.payload.version).toBe(1);
    expect(event?.payload.tenantId).toBe(TENANT_ID);
  });

  it("returns NotFoundError when the template does not exist", async () => {
    const bus = makeBus();
    const handler = new PublishCardTemplateHandler(makeRepo(null), bus);

    const result = await handler.execute({ templateId: TEMPLATE_ID, tenantId: TENANT_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(bus.published).toHaveLength(0);
  });

  it("publish gate: rejects when iconRef is not registered", async () => {
    const bus = makeBus();
    const handler = new PublishCardTemplateHandler(makeRepo(makeTemplateWithoutIcon()), bus);

    const result = await handler.execute({ templateId: TEMPLATE_ID, tenantId: TENANT_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.message).toContain("iconRef");
    expect(bus.published).toHaveLength(0);
  });

  it("publish gate: allows 0 primaryFields (stamp card shows the count below the strip)", async () => {
    const bus = makeBus();
    const handler = new PublishCardTemplateHandler(
      makeRepo(makeTemplateWithNoPrimaryFields()),
      bus,
    );

    const result = await handler.execute({ templateId: TEMPLATE_ID, tenantId: TENANT_ID });

    expect(result.ok).toBe(true);
    expect(bus.published.length).toBeGreaterThan(0);
  });

  it("publish gate: rejects when primaryFields exceeds 1", async () => {
    const bus = makeBus();
    const handler = new PublishCardTemplateHandler(
      makeRepo(makeTemplateWithTooManyPrimaries()),
      bus,
    );

    const result = await handler.execute({ templateId: TEMPLATE_ID, tenantId: TENANT_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.message).toContain("primaryField");
    expect(bus.published).toHaveLength(0);
  });

  it("publish gate: rejects when headerFields exceed Apple Wallet limit of 3", async () => {
    const bus = makeBus();
    const handler = new PublishCardTemplateHandler(makeRepo(makeTemplateWithTooManyHeaders()), bus);

    const result = await handler.execute({ templateId: TEMPLATE_ID, tenantId: TENANT_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.message).toContain("headerFields");
    expect(bus.published).toHaveLength(0);
  });
});

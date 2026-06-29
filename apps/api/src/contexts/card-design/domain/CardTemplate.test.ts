import { describe, it, expect } from "vitest";
import { CardTemplate, CardTemplateId } from "./CardTemplate";
import { BrandConfig, type BrandConfigParams } from "./BrandConfig";
import { RewardRule } from "./RewardRule";
import { RgbColor } from "./RgbColor";
import { DomainError, ValidationError } from "../../../kernel";

const BASE_BRAND: BrandConfigParams = {
  organizationName: "Test Cafe",
  backgroundColor: RgbColor.create(0, 0, 0),
  foregroundColor: RgbColor.create(255, 255, 255),
  headerFields: [],
  primaryFields: [{ key: "points", label: "Points", valueTemplate: "{{points}}" }],
  secondaryFields: [],
  auxiliaryFields: [],
  backFields: [],
};

function makeBrand(overrides: Partial<BrandConfigParams> = {}): BrandConfig {
  return new BrandConfig({ ...BASE_BRAND, ...overrides });
}

function makeRule(): RewardRule {
  return new RewardRule(1, 100, [{ label: "Bronze", minPoints: 0 }]);
}

function makeTemplate(brandOverrides: Partial<BrandConfigParams> = {}): CardTemplate {
  return CardTemplate.create(
    CardTemplateId.generate(),
    "tenant-abc",
    "Loyalty Card",
    makeBrand(brandOverrides),
    makeRule(),
  );
}

describe("CardTemplate", () => {
  it("creates in draft status with version 0", () => {
    const t = makeTemplate();
    expect(t.status).toBe("draft");
    expect(t.version).toBe(0);
  });

  it("emits CardTemplateCreated on create", () => {
    const t = makeTemplate();
    const events = t.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("CardTemplateCreated");
    expect(events[0].payload.tenantId).toBe("tenant-abc");
  });

  it("publishes when brand is valid and increments version to 1", () => {
    const t = makeTemplate({ iconRef: "s3://bucket/icon.png" });
    t.publish();
    expect(t.status).toBe("published");
    expect(t.version).toBe(1);
  });

  it("emits CardTemplatePublished with correct version", () => {
    const t = makeTemplate({ iconRef: "s3://icon" });
    t.pullEvents(); // clear created event
    t.publish();
    const events = t.pullEvents();
    const pub = events.find((e) => e.name === "CardTemplatePublished");
    expect(pub).toBeDefined();
    expect(pub?.payload.version).toBe(1);
    expect(pub?.payload.tenantId).toBe("tenant-abc");
  });

  it("throws DomainError when publishing without iconRef", () => {
    const t = makeTemplate(); // no iconRef
    expect(() => t.publish()).toThrow(DomainError);
  });

  it("re-publishing a published template bumps version and re-emits CardTemplatePublished", () => {
    const t = makeTemplate({ iconRef: "s3://icon" });
    t.publish(); // version → 1
    t.pullEvents(); // clear
    t.publish(); // version → 2
    expect(t.status).toBe("published");
    expect(t.version).toBe(2);
    const events = t.pullEvents();
    const pub = events.find((e) => e.name === "CardTemplatePublished");
    expect(pub).toBeDefined();
    expect(pub?.payload.version).toBe(2);
  });

  it("allows updateBrand on a published template and emits CardTemplateSaved", () => {
    const t = makeTemplate({ iconRef: "s3://icon" });
    t.publish();
    t.pullEvents(); // clear publish event
    // Should not throw — edits are staged until next publish()
    expect(() => t.updateBrand(makeBrand({ iconRef: "s3://icon2" }), makeRule())).not.toThrow();
    const events = t.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("CardTemplateSaved");
    expect(t.status).toBe("published"); // status unchanged by updateBrand
  });

  it("allows applying an asset ref to a published template (staged for next publish)", () => {
    const t = makeTemplate({ iconRef: "s3://icon" });
    t.publish();
    expect(() => t.applyAssetRef("logo", "s3://logo")).not.toThrow();
    expect(t.brand.logoRef).toBe("s3://logo");
  });

  it("rejects hex color strings", () => {
    expect(() => RgbColor.fromString("#ff0000")).toThrow(ValidationError);
  });

  it("validates secondaryFields + auxiliaryFields combined ≤4", () => {
    const brand = makeBrand({
      secondaryFields: [
        { key: "a", label: "A", valueTemplate: "{{a}}" },
        { key: "b", label: "B", valueTemplate: "{{b}}" },
        { key: "c", label: "C", valueTemplate: "{{c}}" },
      ],
      auxiliaryFields: [
        { key: "d", label: "D", valueTemplate: "{{d}}" },
        { key: "e", label: "E", valueTemplate: "{{e}}" },
      ],
      iconRef: "s3://icon",
    });
    const t = CardTemplate.create(CardTemplateId.generate(), "t1", "Card", brand, makeRule());
    expect(() => t.publish()).toThrow(DomainError);
  });

  it("RewardRule rejects pointsPerVisit < 1", () => {
    expect(() => new RewardRule(0, 100, [])).toThrow(ValidationError);
  });
});

import { randomUUID } from "node:crypto";
import { AggregateRoot, UniqueId, DomainError } from "../../../kernel";
import { BrandConfig } from "./BrandConfig";
import { RewardRule } from "./RewardRule";

export class CardTemplateId extends UniqueId {
  static generate(): CardTemplateId {
    return new CardTemplateId(randomUUID());
  }
  static of(v: string): CardTemplateId {
    return new CardTemplateId(v);
  }
}

export type TemplateStatus = "draft" | "published";

export interface CardTemplateProps {
  tenantId: string;
  name: string;
  status: TemplateStatus;
  version: number;
  brand: BrandConfig;
  rewardRule: RewardRule;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CardTemplate aggregate root.
 * State machine: draft → published (one-way). Published templates are immutable;
 * to make changes the merchant creates a new template version.
 */
export class CardTemplate extends AggregateRoot<CardTemplateId> {
  private _tenantId: string;
  private _name: string;
  private _status: TemplateStatus;
  private _version: number;
  private _brand: BrandConfig;
  private _rewardRule: RewardRule;
  readonly createdAt: Date;
  private _updatedAt: Date;

  private constructor(id: CardTemplateId, props: CardTemplateProps) {
    super(id);
    this._tenantId = props.tenantId;
    this._name = props.name;
    this._status = props.status;
    this._version = props.version;
    this._brand = props.brand;
    this._rewardRule = props.rewardRule;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  /** Factory: create a new draft template. Emits CardTemplateCreated. */
  static create(
    id: CardTemplateId,
    tenantId: string,
    name: string,
    brand: BrandConfig,
    rewardRule: RewardRule,
  ): CardTemplate {
    const now = new Date();
    const t = new CardTemplate(id, {
      tenantId,
      name,
      status: "draft",
      version: 0,
      brand,
      rewardRule,
      createdAt: now,
      updatedAt: now,
    });
    t.addEvent(t.makeEvent("CardTemplateCreated", { templateId: id.value, tenantId }));
    return t;
  }

  /** Reconstitute from persistence - no events emitted. */
  static reconstitute(id: CardTemplateId, props: CardTemplateProps): CardTemplate {
    return new CardTemplate(id, props);
  }

  /**
   * Update brand config and reward rule. Only allowed in draft status.
   * Emits CardTemplateSaved.
   */
  updateBrand(brand: BrandConfig, rewardRule: RewardRule, name?: string): void {
    if (this._status !== "draft") {
      throw new DomainError("Only draft templates can be updated", "TEMPLATE_NOT_DRAFT");
    }
    this._brand = brand;
    this._rewardRule = rewardRule;
    if (name !== undefined) this._name = name;
    this._updatedAt = new Date();
    this.addEvent(
      this.makeEvent("CardTemplateSaved", { templateId: this.id.value, tenantId: this._tenantId }),
    );
  }

  /**
   * Register an uploaded asset ref (icon, logo, strip) on the brand config.
   * Only allowed in draft status.
   */
  applyAssetRef(kind: "icon" | "logo" | "strip", ref: string): void {
    if (this._status !== "draft") {
      throw new DomainError("Only draft templates can have assets updated", "TEMPLATE_NOT_DRAFT");
    }
    const params = this._brand.toParams();
    if (kind === "icon") params.iconRef = ref;
    else if (kind === "logo") params.logoRef = ref;
    else params.stripRef = ref;
    this._brand = new BrandConfig(params);
    this._updatedAt = new Date();
  }

  /**
   * Delete this template. Allowed in any status: the pass-issuance snapshot
   * (pass_types), card images, and issued passes are independent of this row
   * (no FK back to card_templates), so deleting never breaks a card already in
   * a customer's Wallet - it only stops new passes being issued from this design.
   * Emits CardTemplateDeleted.
   */
  delete(): void {
    this.addEvent(
      this.makeEvent("CardTemplateDeleted", {
        templateId: this.id.value,
        tenantId: this._tenantId,
      }),
    );
  }

  /**
   * Publish this template. Runs domain validation (field counts, colors, required icon),
   * increments version, transitions to published, emits CardTemplatePublished.
   */
  publish(): void {
    if (this._status === "published") {
      throw new DomainError("Template is already published", "ALREADY_PUBLISHED");
    }
    this._brand.validate();
    this._version += 1;
    this._status = "published";
    this._updatedAt = new Date();
    this.addEvent(
      this.makeEvent("CardTemplatePublished", {
        templateId: this.id.value,
        tenantId: this._tenantId,
        version: this._version,
      }),
    );
  }

  get tenantId(): string {
    return this._tenantId;
  }
  get name(): string {
    return this._name;
  }
  get status(): TemplateStatus {
    return this._status;
  }
  get version(): number {
    return this._version;
  }
  get brand(): BrandConfig {
    return this._brand;
  }
  get rewardRule(): RewardRule {
    return this._rewardRule;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
}

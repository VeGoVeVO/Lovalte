import { randomUUID } from "node:crypto";
import { AggregateRoot, UniqueId } from "../../../kernel";
import { BrandConfig } from "./BrandConfig";
import { RewardRule } from "./RewardRule";
import type { GoogleOverrides } from "../application/dtos";

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
  walletPlatform: 'apple' | 'google';
  googleOverrides?: GoogleOverrides;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CardTemplate aggregate root.
 * State machine: draft → published. Once published, the merchant can edit brand
 * config (updateBrand) and re-publish; each re-publish bumps the version and
 * re-emits CardTemplatePublished so the pass-issuance context refreshes all
 * issued passes.
 */
export class CardTemplate extends AggregateRoot<CardTemplateId> {
  private _tenantId: string;
  private _name: string;
  private _status: TemplateStatus;
  private _version: number;
  private _brand: BrandConfig;
  private _rewardRule: RewardRule;
  private _walletPlatform: 'apple' | 'google';
  private _googleOverrides?: GoogleOverrides;
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
    this._walletPlatform = props.walletPlatform;
    this._googleOverrides = props.googleOverrides;
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
    walletPlatform: 'apple' | 'google' = 'apple',
  ): CardTemplate {
    const now = new Date();
    const t = new CardTemplate(id, {
      tenantId,
      name,
      status: "draft",
      version: 0,
      brand,
      rewardRule,
      walletPlatform,
      googleOverrides: undefined,
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
   * Update brand config and reward rule. Allowed in both draft and published
   * status — published edits are staged and take effect on the next publish()
   * call, which bumps the version and triggers a pass refresh for all holders.
   * Emits CardTemplateSaved.
   */
  updateBrand(brand: BrandConfig, rewardRule: RewardRule, name?: string): void {
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
   * Allowed in draft and published status (published edits take effect on the
   * next publish, alongside updateBrand) so a merchant can swap the logo/strip
   * of a live card and re-publish it to all holders.
   */
  applyAssetRef(kind: "icon" | "logo" | "strip", ref: string): void {
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
   * increments version, transitions to (or stays at) published, emits CardTemplatePublished.
   * When the template is already published this acts as a "re-publish": the version is
   * bumped again and the event is re-emitted so the pass-issuance context refreshes all
   * issued passes with the updated design.
   */
  publish(): void {
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
  get walletPlatform(): 'apple' | 'google' {
    return this._walletPlatform;
  }
  get googleOverrides(): GoogleOverrides | undefined {
    return this._googleOverrides;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  setGoogleOverrides(ov: GoogleOverrides | undefined): void {
    this._googleOverrides = ov;
    this._updatedAt = new Date();
  }
}

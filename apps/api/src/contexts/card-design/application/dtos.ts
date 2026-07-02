import type { CardTemplate } from "../domain/CardTemplate";
import type { CropSource } from "../domain/BrandConfig";
import type { LoyaltyType } from "../domain/RewardRule";
import type { AssetRef } from "./ICardTemplateRepository";

export interface GoogleOverrides {
  bg?: string;
  cardTitle?: string;
  header?: string;
  logoSrc?: string;
  heroSrc?: string;
  textModules?: Array<{ id: string; header: string; body: string }>;
}

export interface FieldDefinitionInput {
  key: string;
  label: string;
  valueTemplate: string;
  numberStyle?: string;
  changeMessage?: string;
}

export interface TierRuleInput {
  label: string;
  minPoints: number;
}

export interface CreateCardTemplateInput {
  tenantId: string;
  name: string;
  organizationName: string;
  logoText?: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  headerFields: FieldDefinitionInput[];
  primaryFields: FieldDefinitionInput[];
  secondaryFields: FieldDefinitionInput[];
  auxiliaryFields: FieldDefinitionInput[];
  backFields: FieldDefinitionInput[];
  pointsPerVisit: number;
  rewardThreshold: number;
  cardType?: LoyaltyType;
  stampIcon?: string;
  /** Uploaded stamp art refs (override the Lucide stamp icon). */
  stampedRef?: string;
  unstampedRef?: string;
  /** Browser-rendered strip frames indexed by stamps earned (publish-time). */
  stampStripRefs?: string[];
  tierRules: TierRuleInput[];
  walletPlatform?: 'apple' | 'google';
  googleOverrides?: GoogleOverrides;
  /** Builder round-trip state: original image + crop transform (frontend re-editing only). */
  heroSource?: CropSource;
  logoSource?: CropSource;
}

export interface UpdateCardTemplateInput extends CreateCardTemplateInput {
  templateId: string;
}

export interface BrandDTO {
  organizationName: string;
  logoText?: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  headerFields: FieldDefinitionInput[];
  primaryFields: FieldDefinitionInput[];
  secondaryFields: FieldDefinitionInput[];
  auxiliaryFields: FieldDefinitionInput[];
  backFields: FieldDefinitionInput[];
  iconRef?: string;
  logoRef?: string;
  stripRef?: string;
  stampIcon?: string;
  stampedRef?: string;
  unstampedRef?: string;
  heroSource?: CropSource;
  logoSource?: CropSource;
}

export interface CardTemplateDTO {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  version: number;
  brand: BrandDTO;
  rewardRule: {
    pointsPerVisit: number;
    rewardThreshold: number;
    cardType: LoyaltyType;
    tierRules: TierRuleInput[];
  };
  walletPlatform: 'apple' | 'google';
  googleOverrides?: GoogleOverrides;
  /** Number of passes issued from this template (cards already in customer wallets). */
  issuedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterAssetRefInput {
  templateId: string;
  tenantId: string;
  kind: "icon" | "logo" | "strip";
  ref: string;
}

export interface AssetRefDTO {
  id: string;
  templateId: string;
  tenantId: string;
  kind: string;
  ref: string;
  createdAt: string;
}

export interface PublishResultDTO {
  id: string;
  version: number;
  status: string;
  /** Non-fatal publish-preflight notices (e.g. no logo/strip uploaded). */
  warnings: string[];
}

export function toCardTemplateDTO(t: CardTemplate, issuedCount = 0): CardTemplateDTO {
  const b = t.brand;
  return {
    id: t.id.value,
    tenantId: t.tenantId,
    name: t.name,
    status: t.status,
    version: t.version,
    issuedCount,
    brand: {
      organizationName: b.organizationName,
      logoText: b.logoText,
      backgroundColor: b.backgroundColor.toRgbString(),
      foregroundColor: b.foregroundColor.toRgbString(),
      labelColor: b.labelColor?.toRgbString(),
      headerFields: [...b.headerFields],
      primaryFields: [...b.primaryFields],
      secondaryFields: [...b.secondaryFields],
      auxiliaryFields: [...b.auxiliaryFields],
      backFields: [...b.backFields],
      iconRef: b.iconRef,
      logoRef: b.logoRef,
      stripRef: b.stripRef,
      stampIcon: b.stampIcon,
      stampedRef: b.stampedRef,
      unstampedRef: b.unstampedRef,
      heroSource: b.heroSource,
      logoSource: b.logoSource,
    },
    rewardRule: {
      pointsPerVisit: t.rewardRule.pointsPerVisit,
      rewardThreshold: t.rewardRule.rewardThreshold,
      cardType: t.rewardRule.cardType,
      tierRules: [...t.rewardRule.tierRules],
    },
    walletPlatform: t.walletPlatform,
    googleOverrides: t.googleOverrides,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toAssetRefDTO(a: AssetRef): AssetRefDTO {
  return {
    id: a.id,
    templateId: a.templateId,
    tenantId: a.tenantId,
    kind: a.kind,
    ref: a.ref,
    createdAt: a.createdAt.toISOString(),
  };
}

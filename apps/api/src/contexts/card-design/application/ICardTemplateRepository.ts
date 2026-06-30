import type { CardTemplate } from "../domain/CardTemplate";

export interface AssetRef {
  id: string;
  tenantId: string;
  templateId: string;
  kind: "icon" | "logo" | "strip";
  ref: string;
  createdAt: Date;
}

/** Application-layer port for card template persistence. Implemented in infrastructure/. */
export interface ICardTemplateRepository {
  findById(id: string, tenantId: string): Promise<CardTemplate | null>;
  findAllByTenant(tenantId: string, status?: string): Promise<CardTemplate[]>;
  /** Upsert the aggregate state. Caller must pull + publish events after this succeeds. */
  save(template: CardTemplate): Promise<void>;
  /** Insert an asset ref record (audit log entry). */
  registerAsset(asset: Omit<AssetRef, "id" | "createdAt">): Promise<AssetRef>;
  findAssetsByTemplate(templateId: string, tenantId: string): Promise<AssetRef[]>;
  /** Hard-delete a template and its asset refs (any status; issued passes are unaffected). */
  delete(id: string, tenantId: string): Promise<void>;
  /** Count issued passes per template id (passes whose pass_type_id matches the template). */
  countIssuedByTemplateIds(tenantId: string, templateIds: string[]): Promise<Map<string, number>>;
  /** Hard-delete ALL tenant-scoped rows across template_assets, card_templates, and card_images. */
  purgeByTenant(tenantId: string): Promise<void>;
}

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
  /** Hard-delete a draft template and its asset refs. */
  delete(id: string, tenantId: string): Promise<void>;
}

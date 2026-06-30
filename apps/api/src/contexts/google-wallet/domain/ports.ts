export interface PassWithTemplate {
  passId: string;
  passTypeId: string;
  tenantId: string;
  fieldValues: Array<{ key: string; label: string; value: string | number }>;
  googleWalletObjectId: string | null;
  organizationName: string;
  logoText: string | null;
  backgroundColorRgb: string;
  imageAssetRefs: Record<string, string>;
}

export interface IGoogleWalletPassRepo {
  findPassWithTemplate(passId: string, tenantId: string): Promise<PassWithTemplate | null>;
  saveGwObjectId(passId: string, tenantId: string, gwObjectId: string): Promise<void>;
}

export interface GwTextModule {
  header: string;
  body: string;
  id: string;
}

export interface GwObjectData {
  hexBackgroundColor: string;
  cardTitle: string;
  header: string;
  barcode: string;
  logoImageUri?: string;
  heroImageUri?: string;
  textModulesData: GwTextModule[];
}

export interface GwObjectPatch {
  textModulesData?: GwTextModule[];
  /** Absolute HTTPS URIs; the REST client maps these to logo/heroImage on PATCH. */
  logoImageUri?: string;
  heroImageUri?: string;
  state?: "ACTIVE" | "EXPIRED";
}

export interface IGoogleWalletRestClient {
  ensureClass(classId: string): Promise<void>;
  createObject(objectId: string, classId: string, data: GwObjectData): Promise<void>;
  patchObject(objectId: string, patch: GwObjectPatch): Promise<void>;
}

export interface IGoogleWalletJwtService {
  buildSaveUrl(objectId: string): string;
}

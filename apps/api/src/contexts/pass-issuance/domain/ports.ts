import type { Pass, PassFieldValue } from "./Pass";

// ── Anti-Corruption Layer DTO ──────────────────────────────────────────────
// Template data is read from the issuance.pass_types snapshot table.
// Never import the card-design context's domain objects here.

export interface FieldDefinition {
  key: string;
  label: string;
  region: "header" | "primary" | "secondary" | "auxiliary" | "back";
  changeMessage?: string;
}

export interface PassTemplateDto {
  id: string;
  tenantId: string;
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string;
  description: string;
  logoText?: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  webServiceUrl: string;
  fieldDefinitions: FieldDefinition[];
  /** Map of asset name to filesystem path or S3 key. */
  imageAssetRefs: Record<string, string>;
}

// ── Repository port ────────────────────────────────────────────────────────

export interface IPassRepository {
  findById(id: string, tenantId: string): Promise<Pass | null>;
  findBySerial(serial: string, tenantId: string): Promise<Pass | null>;
  findByMemberId(memberId: string, tenantId: string): Promise<Pass[]>;
  findByMemberAndType(memberId: string, passTypeId: string, tenantId: string): Promise<Pass | null>;
  save(pass: Pass): Promise<void>;
}

export interface IPassTemplateRepository {
  findById(id: string, tenantId: string): Promise<PassTemplateDto | null>;
  upsert(dto: PassTemplateDto): Promise<void>;
}

// ── Signing port ──────────────────────────────────────────────────────────
// Throws DomainError("Pass signing not configured","DOMAIN_ERROR") if certs absent.

export interface IPassSigningPort {
  sign(
    passJson: Record<string, unknown>,
    imageAssetRefs: Record<string, string>,
  ): Promise<Buffer>;
}

// ── Buffer cache port ─────────────────────────────────────────────────────
// Keys pkpass buffers by (serial, version). Older versions auto-expire via TTL.

export interface IPassBufferCache {
  get(serial: string, version: number): Promise<Buffer | null>;
  put(serial: string, version: number, buffer: Buffer): Promise<void>;
}

// ── Shared DTO ─────────────────────────────────────────────────────────────

export interface PassFieldValueInput {
  key: string;
  label: string;
  value: string | number;
  changeMessage?: string;
}

/** Maps PassFieldValueInput → domain PassFieldValue (structural alias). */
export function toPassFieldValues(inputs: PassFieldValueInput[]): PassFieldValue[] {
  return inputs.map(i => ({ ...i }));
}

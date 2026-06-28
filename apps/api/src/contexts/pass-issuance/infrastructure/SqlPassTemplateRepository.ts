import type { Pool, PoolClient } from "pg";
import type { IPassTemplateRepository, PassTemplateDto, FieldDefinition } from "../domain/ports";

async function setTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

function rowToDto(row: Record<string, unknown>): PassTemplateDto {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    passTypeIdentifier: row.pass_type_identifier as string,
    teamIdentifier: row.team_identifier as string,
    organizationName: row.organization_name as string,
    description: row.description as string,
    logoText: (row.logo_text as string | null) ?? undefined,
    backgroundColor: row.background_color as string,
    foregroundColor: row.foreground_color as string,
    labelColor: (row.label_color as string | null) ?? undefined,
    webServiceUrl: row.web_service_url as string,
    fieldDefinitions: JSON.parse(row.field_definitions as string) as FieldDefinition[],
    imageAssetRefs: JSON.parse(row.image_asset_refs as string) as Record<string, string>,
  };
}

/**
 * Reads pass-type snapshots from the issuance context's own `pass_types` table.
 * This table is populated from `CardTemplatePublished` events (see index.ts).
 * Never cross-imports the card-design domain.
 */
export class SqlPassTemplateRepository implements IPassTemplateRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string, tenantId: string): Promise<PassTemplateDto | null> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      const res = await client.query(
        `SELECT
           id, tenant_id, pass_type_identifier, team_identifier,
           organization_name, description, logo_text,
           background_color, foreground_color, label_color,
           web_service_url,
           field_definitions::text,
           image_asset_refs::text
         FROM pass_types
         WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, tenantId],
      );
      return res.rows.length ? rowToDto(res.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async upsert(dto: PassTemplateDto): Promise<void> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, dto.tenantId);
      await client.query(
        `INSERT INTO pass_types
           (id, tenant_id, pass_type_identifier, team_identifier,
            organization_name, description, logo_text,
            background_color, foreground_color, label_color,
            web_service_url, field_definitions, image_asset_refs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           pass_type_identifier = EXCLUDED.pass_type_identifier,
           team_identifier      = EXCLUDED.team_identifier,
           organization_name    = EXCLUDED.organization_name,
           description          = EXCLUDED.description,
           logo_text            = EXCLUDED.logo_text,
           background_color     = EXCLUDED.background_color,
           foreground_color     = EXCLUDED.foreground_color,
           label_color          = EXCLUDED.label_color,
           web_service_url      = EXCLUDED.web_service_url,
           field_definitions    = EXCLUDED.field_definitions,
           image_asset_refs     = EXCLUDED.image_asset_refs`,
        [
          dto.id,
          dto.tenantId,
          dto.passTypeIdentifier,
          dto.teamIdentifier,
          dto.organizationName,
          dto.description,
          dto.logoText ?? null,
          dto.backgroundColor,
          dto.foregroundColor,
          dto.labelColor ?? null,
          dto.webServiceUrl,
          JSON.stringify(dto.fieldDefinitions),
          JSON.stringify(dto.imageAssetRefs),
        ],
      );
    } finally {
      client.release();
    }
  }
}

import type { Pool, PoolClient } from "pg";
import type { IGoogleWalletPassRepo, PassWithTemplate } from "../domain/ports";

async function setTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

export class GoogleWalletRepository implements IGoogleWalletPassRepo {
  constructor(private readonly pool: Pool) {}

  async findPassWithTemplate(passId: string, tenantId: string): Promise<PassWithTemplate | null> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      const { rows } = await client.query(
        `SELECT
           p.id                        AS pass_id,
           p.pass_type_id,
           p.tenant_id,
           p.field_values::text        AS field_values,
           p.google_wallet_object_id,
           pt.organization_name,
           pt.logo_text,
           pt.background_color,
           pt.image_asset_refs::text   AS image_asset_refs
         FROM passes p
         JOIN pass_types pt ON pt.id = p.pass_type_id AND pt.tenant_id = $2
         WHERE p.id = $1 AND p.tenant_id = $2
         LIMIT 1`,
        [passId, tenantId],
      );
      if (!rows[0]) return null;
      const row = rows[0] as Record<string, unknown>;
      return {
        passId:               row.pass_id as string,
        passTypeId:           row.pass_type_id as string,
        tenantId:             row.tenant_id as string,
        fieldValues:          JSON.parse(row.field_values as string) as PassWithTemplate["fieldValues"],
        googleWalletObjectId: (row.google_wallet_object_id as string | null) ?? null,
        organizationName:     row.organization_name as string,
        logoText:             (row.logo_text as string | null) ?? null,
        backgroundColorRgb:   row.background_color as string,
        imageAssetRefs:       JSON.parse(row.image_asset_refs as string) as Record<string, string>,
      };
    } finally {
      client.release();
    }
  }

  async saveGwObjectId(passId: string, tenantId: string, gwObjectId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      await client.query(
        `UPDATE passes SET google_wallet_object_id = $1 WHERE id = $2 AND tenant_id = $3`,
        [gwObjectId, passId, tenantId],
      );
    } finally {
      client.release();
    }
  }
}

import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../../../db/pool";
import { BrandConfig, type FieldDefinition } from "../domain/BrandConfig";
import { CardTemplate, CardTemplateId, type CardTemplateProps } from "../domain/CardTemplate";
import { RgbColor } from "../domain/RgbColor";
import { RewardRule, type LoyaltyType } from "../domain/RewardRule";
import type { ICardTemplateRepository, AssetRef } from "../application/ICardTemplateRepository";

type BrandRow = Record<string, unknown>;
type RewardRow = Record<string, unknown>;

function toFields(raw: unknown): FieldDefinition[] {
  if (!Array.isArray(raw)) return [];
  return raw as FieldDefinition[];
}

export class CardTemplateRepository implements ICardTemplateRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string, tenantId: string): Promise<CardTemplate | null> {
    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, name, status, version, config, created_at, updated_at
       FROM card_templates
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rows.length === 0) return null;
    return this.rowToTemplate(res.rows[0]);
  }

  async findAllByTenant(tenantId: string, status?: string): Promise<CardTemplate[]> {
    const params: unknown[] = [tenantId];
    let sql = `SELECT id, tenant_id, name, status, version, config, created_at, updated_at
       FROM card_templates
       WHERE tenant_id = $1`;
    if (status !== undefined) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC`;
    const res = await this.pool.query<Record<string, unknown>>(sql, params);
    return res.rows.map((r) => this.rowToTemplate(r));
  }

  async save(template: CardTemplate): Promise<void> {
    const config = {
      brand: template.brand.toJSON(),
      rewardRule: template.rewardRule.toJSON(),
      walletPlatform: template.walletPlatform,
    };

    await withTransaction(this.pool, async (client: PoolClient) => {
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [template.tenantId]);
      await client.query(
        `INSERT INTO card_templates
           (id, tenant_id, name, status, version, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (id) DO UPDATE
           SET name       = EXCLUDED.name,
               status     = EXCLUDED.status,
               version    = EXCLUDED.version,
               config     = EXCLUDED.config,
               updated_at = EXCLUDED.updated_at`,
        [
          template.id.value,
          template.tenantId,
          template.name,
          template.status,
          template.version,
          JSON.stringify(config),
          template.createdAt,
          template.updatedAt,
        ],
      );
    });
  }

  async registerAsset(asset: Omit<AssetRef, "id" | "createdAt">): Promise<AssetRef> {
    const res = await withTransaction(this.pool, async (client: PoolClient) => {
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [asset.tenantId]);
      return client.query<Record<string, unknown>>(
        `INSERT INTO template_assets (tenant_id, template_id, kind, ref)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, template_id, kind, ref, created_at`,
        [asset.tenantId, asset.templateId, asset.kind, asset.ref],
      );
    });
    return this.rowToAsset(res.rows[0]);
  }

  async findAssetsByTemplate(templateId: string, tenantId: string): Promise<AssetRef[]> {
    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, template_id, kind, ref, created_at
       FROM template_assets
       WHERE template_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [templateId, tenantId],
    );
    return res.rows.map((r) => this.rowToAsset(r));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await withTransaction(this.pool, async (client: PoolClient) => {
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(`DELETE FROM template_assets WHERE template_id = $1 AND tenant_id = $2`, [
        id,
        tenantId,
      ]);
      // Any status: card_images and the pass-issuance snapshot have no FK back
      // here, so issued passes keep working after the template row is gone.
      await client.query(`DELETE FROM card_templates WHERE id = $1 AND tenant_id = $2`, [
        id,
        tenantId,
      ]);
    });
  }

  // ponytail: cross-context read of pass-issuance's `passes` table (count only).
  // Cleaner long-term = a PassIssued/PassDeleted projection owned by this
  // context; a read-only COUNT through a named port is the pragmatic ceiling.
  async countIssuedByTemplateIds(
    tenantId: string,
    templateIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (templateIds.length === 0) return counts;
    const res = await this.pool.query<{ pass_type_id: string; n: string }>(
      `SELECT pass_type_id, count(*)::text AS n
         FROM passes
        WHERE tenant_id = $1 AND pass_type_id = ANY($2::uuid[])
        GROUP BY pass_type_id`,
      [tenantId, templateIds],
    );
    for (const row of res.rows) counts.set(row.pass_type_id, Number(row.n));
    return counts;
  }

  private rowToTemplate(row: Record<string, unknown>): CardTemplate {
    const cfg = row.config as { brand: BrandRow; rewardRule: RewardRow; walletPlatform?: 'apple' | 'google' };
    const b = cfg.brand;
    const rr = cfg.rewardRule;

    const brand = new BrandConfig({
      organizationName: b.organizationName as string,
      logoText: (b.logoText as string | null) ?? undefined,
      backgroundColor: RgbColor.fromString(b.backgroundColor as string),
      foregroundColor: RgbColor.fromString(b.foregroundColor as string),
      labelColor: b.labelColor ? RgbColor.fromString(b.labelColor as string) : undefined,
      headerFields: toFields(b.headerFields),
      primaryFields: toFields(b.primaryFields),
      secondaryFields: toFields(b.secondaryFields),
      auxiliaryFields: toFields(b.auxiliaryFields),
      backFields: toFields(b.backFields),
      iconRef: (b.iconRef as string | null) ?? undefined,
      logoRef: (b.logoRef as string | null) ?? undefined,
      stripRef: (b.stripRef as string | null) ?? undefined,
      stampIcon: (b.stampIcon as string | null) ?? undefined,
      stampedRef: (b.stampedRef as string | null) ?? undefined,
      unstampedRef: (b.unstampedRef as string | null) ?? undefined,
      stampStripRefs: Array.isArray(b.stampStripRefs) ? (b.stampStripRefs as string[]) : undefined,
    });

    const rule = new RewardRule(
      rr.pointsPerVisit as number,
      rr.rewardThreshold as number,
      (rr.tierRules as Array<{ label: string; minPoints: number }>) ?? [],
      (rr.cardType as LoyaltyType | undefined) ?? "points",
    );

    const props: CardTemplateProps = {
      tenantId: row.tenant_id as string,
      name: row.name as string,
      status: row.status as "draft" | "published",
      version: row.version as number,
      brand,
      rewardRule: rule,
      walletPlatform: cfg.walletPlatform ?? 'apple',
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };

    return CardTemplate.reconstitute(CardTemplateId.of(row.id as string), props);
  }

  private rowToAsset(row: Record<string, unknown>): AssetRef {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      templateId: row.template_id as string,
      kind: row.kind as "icon" | "logo" | "strip",
      ref: row.ref as string,
      createdAt: row.created_at as Date,
    };
  }
}

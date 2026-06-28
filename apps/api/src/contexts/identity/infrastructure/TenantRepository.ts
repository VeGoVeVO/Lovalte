import type { Pool } from "pg";
import { Tenant } from "../domain/Tenant";
import { Slug } from "../domain/Slug";
import type { ITenantRepository } from "../application/ports";

type TenantRow = {
  id: string;
  display_name: string;
  slug: string;
  status: string;
  plan: string;
  created_at: Date;
  updated_at: Date;
};

/**
 * PostgreSQL implementation of ITenantRepository.
 * iam.tenants has no RLS (tenant table itself is not scoped by tenant_id).
 * All SQL uses parameterised $N placeholders - no string concatenation.
 */
export class TenantRepository implements ITenantRepository {
  constructor(private readonly pool: Pool) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const result = await this.pool.query<TenantRow>(
      `SELECT id, display_name, slug, status, plan, created_at, updated_at
         FROM iam.tenants
        WHERE slug = $1
        LIMIT 1`,
      [slug],
    );
    if (result.rows.length === 0) return null;
    return this.toAggregate(result.rows[0]);
  }

  async findById(tenantId: string): Promise<Tenant | null> {
    const result = await this.pool.query<TenantRow>(
      `SELECT id, display_name, slug, status, plan, created_at, updated_at
         FROM iam.tenants
        WHERE id = $1
        LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return null;
    return this.toAggregate(result.rows[0]);
  }

  async save(tenant: Tenant): Promise<void> {
    await this.pool.query(
      `INSERT INTO iam.tenants (id, display_name, slug, status, plan, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             status       = EXCLUDED.status,
             updated_at   = EXCLUDED.updated_at`,
      [
        tenant.id.value,
        tenant.name,
        tenant.slug.value,
        tenant.status,
        tenant.plan,
        tenant.createdAt,
        tenant.updatedAt,
      ],
    );
  }

  private toAggregate(row: TenantRow): Tenant {
    return Tenant.reconstitute(row.id, {
      name: row.display_name,
      slug: Slug.fromStored(row.slug),
      status: row.status as Tenant["status"],
      plan: row.plan,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}

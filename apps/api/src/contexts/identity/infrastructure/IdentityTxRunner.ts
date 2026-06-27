import type { Pool } from "pg";
import { withTransaction } from "../../../db/pool";
import type { Tenant } from "../domain/Tenant";
import type { User } from "../domain/User";
import type { Invitation } from "../domain/Invitation";
import type { IIdentityTxRunner } from "../application/ports";

/**
 * Runs multi-aggregate writes inside a single PostgreSQL transaction.
 * Keeps application handlers free of pg/PoolClient dependencies.
 */
export class IdentityTxRunner implements IIdentityTxRunner {
  constructor(private readonly pool: Pool) {}

  /**
   * INSERT tenant + INSERT owner user atomically.
   * Used by SignUpTenantHandler.
   */
  async signUpTx(tenant: Tenant, user: User): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO iam.tenants (id, display_name, slug, status, plan, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenant.id.value,
          tenant.name,
          tenant.slug.value,
          tenant.status,
          tenant.plan,
          tenant.createdAt,
          tenant.updatedAt,
        ]
      );

      await client.query(
        `INSERT INTO iam.users
           (id, tenant_id, email, password_hash, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id.value,
          user.tenantId,
          user.email.value,
          user.passwordHash.encoded,
          user.role,
          user.status,
          user.createdAt,
          user.updatedAt,
        ]
      );
    });
  }

  /**
   * UPDATE invitation.used_at + INSERT accepted user atomically.
   * Used by AcceptInvitationHandler.
   */
  async acceptInvitationTx(invitation: Invitation, user: User): Promise<void> {
    const usedAt = invitation.usedAt ?? new Date();

    await withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE iam.invitations SET used_at = $1 WHERE id = $2 AND used_at IS NULL`,
        [usedAt, invitation.id.value]
      );

      await client.query(
        `INSERT INTO iam.users
           (id, tenant_id, email, password_hash, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id.value,
          user.tenantId,
          user.email.value,
          user.passwordHash.encoded,
          user.role,
          user.status,
          user.createdAt,
          user.updatedAt,
        ]
      );
    });
  }
}

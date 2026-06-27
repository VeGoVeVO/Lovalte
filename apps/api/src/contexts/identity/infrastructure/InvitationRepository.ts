import type { Pool, PoolClient } from "pg";
import { Invitation } from "../domain/Invitation";
import type { InvitationRole } from "../domain/Invitation";
import type { IInvitationRepository } from "../application/ports";

type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  token_hash: string;
  expires_at: Date;
  invited_by: string;
  used_at: Date | null;
  created_at: Date;
};

/**
 * PostgreSQL implementation of IInvitationRepository.
 * iam.invitations has RLS on tenant_id; all queries also filter explicitly.
 */
export class InvitationRepository implements IInvitationRepository {
  constructor(private readonly pool: Pool) {}

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const r = await this.pool.query<InvitationRow>(
      `SELECT id, tenant_id, email, role, token_hash, expires_at, invited_by, used_at, created_at
         FROM iam.invitations
        WHERE token_hash = $1
        LIMIT 1`,
      [tokenHash]
    );
    return r.rows.length > 0 ? this.toEntity(r.rows[0]) : null;
  }

  async findPendingByEmail(tenantId: string, email: string): Promise<Invitation | null> {
    const r = await this.pool.query<InvitationRow>(
      `SELECT id, tenant_id, email, role, token_hash, expires_at, invited_by, used_at, created_at
         FROM iam.invitations
        WHERE tenant_id = $1
          AND email     = $2
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1`,
      [tenantId, email.toLowerCase()]
    );
    return r.rows.length > 0 ? this.toEntity(r.rows[0]) : null;
  }

  async save(invitation: Invitation): Promise<void> {
    await this.pool.query(
      `INSERT INTO iam.invitations
         (id, tenant_id, email, role, token_hash, expires_at, invited_by, used_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        invitation.id.value,
        invitation.tenantId,
        invitation.email,
        invitation.role,
        invitation.tokenHash,
        invitation.expiresAt,
        invitation.invitedBy,
        invitation.usedAt,
        invitation.createdAt,
      ]
    );
  }

  async markUsed(invitationId: string, usedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE iam.invitations SET used_at = $1 WHERE id = $2`,
      [usedAt, invitationId]
    );
  }

  /** Used by IdentityTxRunner inside a transaction. */
  async markUsedWithClient(client: PoolClient, invitationId: string, usedAt: Date): Promise<void> {
    await client.query(
      `UPDATE iam.invitations SET used_at = $1 WHERE id = $2`,
      [usedAt, invitationId]
    );
  }

  private toEntity(row: InvitationRow): Invitation {
    return Invitation.reconstitute(row.id, {
      tenantId: row.tenant_id,
      email: row.email,
      role: row.role as InvitationRole,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      invitedBy: row.invited_by,
      usedAt: row.used_at,
      createdAt: row.created_at,
    });
  }
}

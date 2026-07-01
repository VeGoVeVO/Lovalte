import type { Pool } from "pg";
import { PasswordReset } from "../domain/PasswordReset";
import type { IPasswordResetRepository } from "../application/ports";

type PasswordResetRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

const SELECT_COLS = `id, tenant_id, user_id, email, token_hash, expires_at, used_at, created_at`;

export class PasswordResetRepository implements IPasswordResetRepository {
  constructor(private readonly pool: Pool) {}

  async findByTokenHash(tokenHash: string): Promise<PasswordReset | null> {
    const r = await this.pool.query<PasswordResetRow>(
      `SELECT ${SELECT_COLS} FROM iam.password_resets
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    return r.rows[0] ? this.toEntity(r.rows[0]) : null;
  }

  async save(reset: PasswordReset): Promise<void> {
    await this.pool.query(
      `INSERT INTO iam.password_resets
         (id, tenant_id, user_id, email, token_hash, expires_at, used_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        reset.id.value,
        reset.tenantId,
        reset.userId,
        reset.email,
        reset.tokenHash,
        reset.expiresAt,
        reset.usedAt,
        reset.createdAt,
      ],
    );
  }

  private toEntity(row: PasswordResetRow): PasswordReset {
    return PasswordReset.reconstitute(row.id, {
      tenantId: row.tenant_id,
      userId: row.user_id,
      email: row.email,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    });
  }
}

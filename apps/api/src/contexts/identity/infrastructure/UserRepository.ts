import type { Pool, PoolClient } from "pg";
import { User } from "../domain/User";
import type { UserRole, UserStatus } from "../domain/User";
import { Email } from "../domain/Email";
import { PasswordHash } from "../domain/PasswordHash";
import type { IUserRepository } from "../application/ports";

type UserRow = {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

const SELECT_COLS = `id, tenant_id, email, password_hash, role, status, created_at, updated_at`;

/**
 * PostgreSQL implementation of IUserRepository.
 * iam.users has RLS on tenant_id; queries also include explicit tenant_id filter (belt-and-suspenders).
 */
export class UserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const r = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLS} FROM iam.users
        WHERE tenant_id = $1 AND email = $2
        LIMIT 1`,
      [tenantId, email.toLowerCase()]
    );
    return r.rows.length > 0 ? this.toAggregate(r.rows[0]) : null;
  }

  async findByEmailGlobal(email: string): Promise<User | null> {
    const r = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLS} FROM iam.users
        WHERE email = $1
        ORDER BY created_at ASC
        LIMIT 1`,
      [email.toLowerCase()]
    );
    return r.rows.length > 0 ? this.toAggregate(r.rows[0]) : null;
  }

  async findById(userId: string, tenantId: string): Promise<User | null> {
    const r = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLS} FROM iam.users
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1`,
      [userId, tenantId]
    );
    return r.rows.length > 0 ? this.toAggregate(r.rows[0]) : null;
  }

  async findAllByTenant(tenantId: string): Promise<User[]> {
    const r = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLS} FROM iam.users
        WHERE tenant_id = $1
        ORDER BY created_at ASC`,
      [tenantId]
    );
    return r.rows.map((row) => this.toAggregate(row));
  }

  async save(user: User): Promise<void> {
    await this.pool.query(
      `INSERT INTO iam.users
         (id, tenant_id, email, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
         SET email         = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             role          = EXCLUDED.role,
             status        = EXCLUDED.status,
             updated_at    = EXCLUDED.updated_at`,
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
  }

  /** Used by IdentityTxRunner inside a transaction — saves via the provided client. */
  async saveWithClient(client: PoolClient, user: User): Promise<void> {
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
  }

  private toAggregate(row: UserRow): User {
    return User.reconstitute(row.id, {
      tenantId: row.tenant_id,
      email: Email.fromStored(row.email),
      passwordHash: PasswordHash.fromEncoded(row.password_hash),
      role: row.role as UserRole,
      status: row.status as UserStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}

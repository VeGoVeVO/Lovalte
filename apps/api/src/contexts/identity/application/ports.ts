import type { Tenant } from "../domain/Tenant";
import type { User } from "../domain/User";
import type { Invitation } from "../domain/Invitation";

/** Read/write access to the Tenant aggregate. */
export interface ITenantRepository {
  findBySlug(slug: string): Promise<Tenant | null>;
  findById(tenantId: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<void>;
}

/** Read/write access to the User aggregate. */
export interface IUserRepository {
  /** Find by email within a tenant. Case-insensitive (email already normalised). */
  findByEmail(tenantId: string, email: string): Promise<User | null>;
  /** Find by email across all tenants (login without a slug). First match wins. */
  findByEmailGlobal(email: string): Promise<User | null>;
  findById(userId: string, tenantId: string): Promise<User | null>;
  findAllByTenant(tenantId: string): Promise<User[]>;
  save(user: User): Promise<void>;
}

/** Read/write access to Invitation records. */
export interface IInvitationRepository {
  /** Lookup by unhashed token: caller hashes token then queries by hash. */
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  /** Check whether a pending (unused, non-expired) invite exists for this email. */
  findPendingByEmail(tenantId: string, email: string): Promise<Invitation | null>;
  save(invitation: Invitation): Promise<void>;
  markUsed(invitationId: string, usedAt: Date): Promise<void>;
}

/**
 * Runs multi-aggregate operations inside a single DB transaction.
 * Defined here (application boundary) so the handler stays free of pg types.
 */
export interface IIdentityTxRunner {
  /** INSERT tenant + INSERT owner user atomically. */
  signUpTx(tenant: Tenant, user: User): Promise<void>;
  /** UPDATE invitation.used_at + INSERT accepted user atomically. */
  acceptInvitationTx(invitation: Invitation, user: User): Promise<void>;
}

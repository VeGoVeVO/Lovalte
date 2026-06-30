import type { Member } from "./Member";
import type { TierRule } from "./TierRule";

/** A row returned from the append-only point ledger. */
export interface LedgerRow {
  id: string;
  memberId: string;
  tenantId: string;
  delta: number;
  reason: string;
  recordedAt: Date;
}

/** Port: persistence contract for the Member aggregate. */
export interface IMemberRepository {
  findById(id: string, tenantId: string): Promise<Member | null>;
  findByPassId(passId: string, tenantId: string): Promise<Member | null>;
  listByTenant(tenantId: string): Promise<Member[]>;
  /** Members whose pass was issued from a given card template (per-card view). */
  listByCardTemplate(cardTemplateId: string, tenantId: string): Promise<Member[]>;
  save(member: Member): Promise<void>;
  purgeByTenant(tenantId: string): Promise<void>;
}

/** Port: append-only point ledger. */
export interface ILedgerRepository {
  append(row: {
    memberId: string;
    tenantId: string;
    delta: number;
    reason: string;
    referenceId?: string;
  }): Promise<void>;

  findByMember(
    memberId: string,
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: LedgerRow[]; total: number }>;
}

/** Port: read tenant tier threshold rules. */
export interface ITierRepository {
  findByTenant(tenantId: string): Promise<TierRule[]>;
}

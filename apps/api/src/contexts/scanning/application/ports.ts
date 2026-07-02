import type { RedemptionEvent } from "../domain/RedemptionEvent";

/** Persistence port for the append-only redemption_events table. */
export interface IRedemptionEventRepository {
  /** Persist a new redemption event. Silently ignores idempotency_key unique violations. */
  save(event: RedemptionEvent): Promise<void>;
  /** Hard-delete all redemption_events rows for the given tenant. Called on TenantDeleted. */
  purgeByTenant(tenantId: string): Promise<void>;
}

/**
 * Resolves a scanned wallet barcode (the bare passId) to whether it belongs to
 * the scanning tenant. Implemented in infrastructure/ as an RLS-scoped read of
 * the pass-issuance `passes` table - so a pass from another tenant is invisible
 * and the scan is rejected, giving tenant isolation for free. No crypto: the
 * trust boundary is the authenticated staff session, not the barcode.
 */
export interface IPassLookup {
  /** True iff a live (non-voided) pass with this id exists for `tenantId`. */
  existsForTenant(passId: string, tenantId: string): Promise<boolean>;
}

export interface ScanPreview {
  readonly passId: string;
  readonly cardName: string;
  readonly cardType: string;
  readonly member: {
    readonly id: string;
    readonly displayName: string | null;
    readonly email: string | null;
    readonly balance: number;
    readonly tier: string;
    readonly status: string;
    readonly enrolledAt: string;
  };
}

/**
 * Read model for the staff scan confirmation screen. This is deliberately
 * narrower than the full Membership API so staff can verify the captured card
 * without being granted broad member-list access.
 */
export interface IScanPreviewLookup {
  findPreview(passId: string, tenantId: string): Promise<ScanPreview | null>;
}

/**
 * Minimal cache port over Redis.
 * Abstracts ioredis so the application layer stays infrastructure-free.
 */
export interface ICacheStore {
  /**
   * Atomically SET key=value only if the key is absent (Redis SET NX).
   * Returns true when the key was newly written, false when it already existed.
   */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

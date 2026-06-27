import type { QrToken } from "../domain/QrToken";
import type { RedemptionEvent } from "../domain/RedemptionEvent";

/** Persistence port for the append-only redemption_events table. */
export interface IRedemptionEventRepository {
  /** Persist a new redemption event. Silently ignores idempotency_key unique violations. */
  save(event: RedemptionEvent): Promise<void>;
}

/**
 * Cryptographic QR token verification port.
 * Implementations live in infrastructure/; they call node:crypto directly.
 * Throws a DomainError subclass on invalid signature, expired token, or malformed payload.
 */
export interface IQrVerifier {
  verify(rawToken: string): Promise<QrToken>;
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

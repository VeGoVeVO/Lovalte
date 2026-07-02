import type { Pool } from "pg";
import type Redis from "ioredis";
import type { AppConfig } from "../config/env";
import type { DomainEventBus, Clock } from "../kernel";

/**
 * Late-bound cross-context capabilities. A context REGISTERS a capability at
 * module init; a consumer resolves it lazily at call time (never at boot, so
 * registration order between modules doesn't matter). Synchronous read-side
 * needs only — anything transactional still goes through domain events.
 */
export interface WalletServices {
  /**
   * Registered by pass-issuance. Re-signs the pass for `serialNumber` and puts
   * the buffer in the shared pkpass cache, returning it (null if the pass is
   * unknown or signing fails). Lets delivery self-heal a cache miss instead of
   * 503ing forever.
   */
  ensurePkpassCached?: (serialNumber: string) => Promise<Buffer | null>;
  /**
   * Registered by google-wallet (only when that module is configured). Returns
   * the pay.google.com save URL for a pass, or null on any failure. Lets the
   * platform-branching enroll endpoint 302 Android scanners straight to the
   * native Google Wallet add screen.
   */
  googleWalletSaveUrl?: (passId: string, tenantId: string) => Promise<string | null>;
}

/** Cross-cutting infrastructure handed to every context module at composition. */
export interface Deps {
  readonly pool: Pool;
  readonly redis: Redis;
  readonly bus: DomainEventBus;
  readonly clock: Clock;
  readonly config: AppConfig;
  readonly services: WalletServices;
}

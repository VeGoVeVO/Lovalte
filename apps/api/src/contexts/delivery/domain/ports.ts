import type { Device } from "./Device";
import type { Registration } from "./Registration";

// ---------------------------------------------------------------------------
// Device repository
// ---------------------------------------------------------------------------

export interface IDeviceRepository {
  findByLibId(deviceLibraryIdentifier: string): Promise<Device | null>;
  /** Used by dead-token cleanup to resolve which device owns a rejected APNs token. */
  findByPushToken(pushToken: string): Promise<Device | null>;
  /**
   * Upsert: insert on first registration; overwrite push_token on subsequent
   * registrations for the same device_library_identifier.
   */
  upsert(
    deviceLibraryIdentifier: string,
    pushToken: string,
  ): Promise<{ device: Device; isNew: boolean }>;
  delete(deviceId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Registration repository
// ---------------------------------------------------------------------------

export interface UpdatedSerialRow {
  serialNumber: string;
  updatedAt: Date;
}

export interface IRegistrationRepository {
  findByDeviceAndPass(deviceId: string, passId: string): Promise<Registration | null>;
  save(reg: Registration): Promise<void>;
  /** Delete a single registration. Also called by unregister flow. */
  deleteByDeviceAndSerial(deviceId: string, serialNumber: string): Promise<void>;
  /** Dead-token cleanup: delete every registration for a device in one shot. */
  deleteAllByDevice(deviceId: string): Promise<void>;
  /** Count remaining registrations for a device - used to decide if device row can be deleted. */
  countByDevice(deviceId: string): Promise<number>;
  /**
   * Apple endpoint 9.2: serials updated since an opaque epoch tag.
   * `sinceMs` is a millisecond epoch (undefined = return everything registered).
   */
  findUpdatedSince(
    deviceLibraryIdentifier: string,
    passTypeIdentifier: string,
    sinceMs?: number,
  ): Promise<UpdatedSerialRow[]>;
  /** Push-notification trigger: push tokens for all devices registered to a pass. */
  findPushTokensByPassId(passId: string): Promise<string[]>;
  /**
   * Apple endpoint 9.3: stamp last_fetched_at = now() on every registration for
   * a pass after a successful (200) binary fetch. ponytail: Apple's GetLatestPass
   * request carries no deviceLibraryIdentifier, so we cannot attribute the fetch
   * to a single device - all registrations for the pass are touched together.
   * Ceiling: per-device staleness is imprecise when a pass has multiple devices.
   * Upgrade path: none available within the Apple-defined protocol.
   */
  touchLastFetchedByPass(passId: string): Promise<void>;
  /**
   * Reconciliation sweep: passes with registrations whose last successful fetch
   * predates the pass's last update, and with no successful push since then.
   */
  findStalePassIds(): Promise<string[]>;
  /** Hard-delete all registrations belonging to a tenant (account-deletion flow). */
  purgeByTenant(tenantId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Push notification port (APNs)
// ---------------------------------------------------------------------------

/** Per-token outcome of a push attempt, used for push_log persistence + dead-token cleanup. */
export interface PushResult {
  pushToken: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

export interface IPushNotificationPort {
  notify(pushTokens: string[], passTypeIdentifier: string): Promise<PushResult[]>;
}

// ---------------------------------------------------------------------------
// Push attempt log (observability)
// ---------------------------------------------------------------------------

export interface PushLogEntry {
  passId: string;
  serialNumber: string;
  pushToken: string;
  ok: boolean;
  apnsStatus?: number;
  reason?: string;
}

export interface IPushLogRepository {
  record(entry: PushLogEntry): Promise<void>;
}

// ---------------------------------------------------------------------------
// Apple Wallet diagnostic log persistence (endpoint 9.5)
// ---------------------------------------------------------------------------

export interface IWalletDeviceLogRepository {
  record(logs: string[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Merchant-facing delivery status query
// ---------------------------------------------------------------------------

export interface DeliveryStatsDTO {
  passes: number;
  registeredDevices: number;
  upToDateDevices: number;
  staleDevices: number;
  pushFailures24h: number;
  lastPushAt: Date | null;
}

export interface IDeliveryStatsPort {
  getStats(templateId: string, tenantId: string): Promise<DeliveryStatsDTO>;
}

// ---------------------------------------------------------------------------
// Read-only cross-context pass access (no domain import from pass-issuance)
// ---------------------------------------------------------------------------

/** Minimal projection of issuance.passes needed by the delivery context. */
export interface PassReadDTO {
  id: string;
  tenantId: string;
  serialNumber: string;
  passTypeIdentifier: string;
  authenticationToken: string;
  updatedAt: Date;
  version: number;
}

export interface IPassReadPort {
  findBySerial(serialNumber: string): Promise<PassReadDTO | null>;
  findById(passId: string): Promise<PassReadDTO | null>;
}

// ---------------------------------------------------------------------------
// Binary pass retrieval (S3 cache of the signed .pkpass buffer)
// ---------------------------------------------------------------------------

export interface IPassBinaryPort {
  /** Return the signed .pkpass bytes for (serial, version) from the cache, or null. */
  get(serialNumber: string, version: number): Promise<Buffer | null>;
}

// ---------------------------------------------------------------------------
// Self-heal: resign a pass whose cached buffer fell out of the shared cache
// ---------------------------------------------------------------------------

export interface IPassResignPort {
  /**
   * Ask pass-issuance to re-sign and re-cache the pass for `serialNumber`.
   * Returns null when pass-issuance hasn't registered the capability
   * (deps.services.ensurePkpassCached is undefined) or re-signing failed.
   */
  ensureCached(serialNumber: string): Promise<Buffer | null>;
}

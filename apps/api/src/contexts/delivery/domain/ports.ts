import type { Device } from "./Device";
import type { Registration } from "./Registration";

// ---------------------------------------------------------------------------
// Device repository
// ---------------------------------------------------------------------------

export interface IDeviceRepository {
  findByLibId(deviceLibraryIdentifier: string): Promise<Device | null>;
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
  /** Count remaining registrations for a device — used to decide if device row can be deleted. */
  countByDevice(deviceId: string): Promise<number>;
  /** Apple endpoint 9.2: serials updated since an opaque epoch tag. */
  findUpdatedSince(
    deviceLibraryIdentifier: string,
    passTypeIdentifier: string,
    since?: Date,
  ): Promise<UpdatedSerialRow[]>;
  /** Push-notification trigger: push tokens for all devices registered to a pass. */
  findPushTokensByPassId(passId: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Push notification port (stub APNs)
// ---------------------------------------------------------------------------

export interface IPushNotificationPort {
  notify(pushTokens: string[], passTypeIdentifier: string): Promise<void>;
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
  pkpassS3Key: string | null;
}

export interface IPassReadPort {
  findBySerial(serialNumber: string): Promise<PassReadDTO | null>;
  findById(passId: string): Promise<PassReadDTO | null>;
}

// ---------------------------------------------------------------------------
// Binary pass retrieval (S3 cache of the signed .pkpass buffer)
// ---------------------------------------------------------------------------

export interface IPassBinaryPort {
  /** Return the signed .pkpass bytes from object storage, or null if not cached. */
  get(s3Key: string): Promise<Buffer | null>;
}

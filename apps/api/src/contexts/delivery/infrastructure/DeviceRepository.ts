import type { Pool } from "pg";
import { Device } from "../domain/Device";
import { DeviceId } from "../domain/DeviceId";
import type { IDeviceRepository } from "../domain/ports";

interface DeviceRow {
  id: string;
  device_library_identifier: string;
  push_token: string;
  updated_at: Date;
}

export class DeviceRepository implements IDeviceRepository {
  constructor(private readonly pool: Pool) {}

  async findByLibId(deviceLibraryIdentifier: string): Promise<Device | null> {
    const r = await this.pool.query<DeviceRow>(
      `SELECT id, device_library_identifier, push_token, updated_at
       FROM delivery.devices
       WHERE device_library_identifier = $1`,
      [deviceLibraryIdentifier],
    );
    return r.rows.length ? this._map(r.rows[0]) : null;
  }

  /**
   * Upsert: inserts on first contact; overwrites push_token on re-registration.
   * `xmax = 0` is a PostgreSQL-specific trick: true when the row was just INSERTed,
   * false when it was UPDATEd by ON CONFLICT.
   */
  async upsert(
    deviceLibraryIdentifier: string,
    pushToken: string,
  ): Promise<{ device: Device; isNew: boolean }> {
    const r = await this.pool.query<DeviceRow & { is_new: boolean }>(
      `INSERT INTO delivery.devices (device_library_identifier, push_token)
       VALUES ($1, $2)
       ON CONFLICT (device_library_identifier)
       DO UPDATE SET push_token = EXCLUDED.push_token,
                     updated_at = now()
       RETURNING *, (xmax = 0) AS is_new`,
      [deviceLibraryIdentifier, pushToken],
    );
    const row = r.rows[0];
    return { device: this._map(row), isNew: row.is_new };
  }

  async delete(deviceId: string): Promise<void> {
    await this.pool.query(`DELETE FROM delivery.devices WHERE id = $1`, [deviceId]);
  }

  private _map(row: DeviceRow): Device {
    return Device.reconstitute({
      id: DeviceId.from(row.id),
      deviceLibraryIdentifier: row.device_library_identifier,
      pushToken: row.push_token,
      updatedAt: row.updated_at,
    });
  }
}

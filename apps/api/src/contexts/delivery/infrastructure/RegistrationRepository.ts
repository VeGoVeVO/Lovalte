import type { Pool } from "pg";
import { Registration, RegistrationId } from "../domain/Registration";
import { DeviceId } from "../domain/DeviceId";
import type { IRegistrationRepository, UpdatedSerialRow } from "../domain/ports";

interface RegRow {
  id: string;
  tenant_id: string;
  device_id: string;
  pass_id: string;
  created_at: Date;
}

export class RegistrationRepository implements IRegistrationRepository {
  constructor(private readonly pool: Pool) {}

  async findByDeviceAndPass(deviceId: string, passId: string): Promise<Registration | null> {
    const r = await this.pool.query<RegRow>(
      `SELECT id, tenant_id, device_id, pass_id, created_at
       FROM delivery.registrations
       WHERE device_id = $1 AND pass_id = $2`,
      [deviceId, passId],
    );
    return r.rows.length ? this._map(r.rows[0]) : null;
  }

  async save(reg: Registration): Promise<void> {
    await this.pool.query(
      `INSERT INTO delivery.registrations (id, tenant_id, device_id, pass_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_id, pass_id) DO NOTHING`,
      [reg.id.value, reg.tenantId, reg.deviceId.value, reg.passId],
    );
  }

  /**
   * Delete by device_id + serial_number (the unregister flow supplies the serial).
   * Uses a subquery to resolve pass_id from passes without importing
   * the pass-issuance context.
   */
  async deleteByDeviceAndSerial(deviceId: string, serialNumber: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM delivery.registrations
       WHERE device_id = $1
         AND pass_id = (
           SELECT id FROM passes WHERE serial_number = $2 LIMIT 1
         )`,
      [deviceId, serialNumber],
    );
  }

  async countByDevice(deviceId: string): Promise<number> {
    const r = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM delivery.registrations WHERE device_id = $1`,
      [deviceId],
    );
    return parseInt(r.rows[0].count, 10);
  }

  /**
   * PassKit endpoint 9.2: serial numbers of passes whose updated_at is
   * newer than `since`. When `since` is undefined, returns all registered serials.
   */
  async findUpdatedSince(
    deviceLibraryIdentifier: string,
    passTypeIdentifier: string,
    since?: Date,
  ): Promise<UpdatedSerialRow[]> {
    const params: unknown[] = [deviceLibraryIdentifier, passTypeIdentifier];
    const sinceClause = since ? "AND p.last_updated > $3" : "";
    if (since) params.push(since);

    const r = await this.pool.query<{ serial_number: string; last_updated: Date }>(
      `SELECT p.serial_number, p.last_updated
       FROM delivery.registrations reg
       JOIN delivery.devices d ON d.id  = reg.device_id
       JOIN passes p           ON p.id  = reg.pass_id
       JOIN pass_types pt      ON pt.id = p.pass_type_id
       WHERE d.device_library_identifier = $1
         AND pt.pass_type_identifier     = $2
         ${sinceClause}`,
      params,
    );
    return r.rows.map((row) => ({ serialNumber: row.serial_number, updatedAt: row.last_updated }));
  }

  /**
   * Returns APNs push tokens for all devices registered to a given pass.
   * Called by the PassFieldsUpdated event subscriber.
   */
  async findPushTokensByPassId(passId: string): Promise<string[]> {
    const r = await this.pool.query<{ push_token: string }>(
      `SELECT d.push_token
       FROM delivery.registrations reg
       JOIN delivery.devices d ON d.id = reg.device_id
       WHERE reg.pass_id = $1`,
      [passId],
    );
    return r.rows.map((row) => row.push_token);
  }

  async purgeByTenant(tenantId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      await client.query(
        `DELETE FROM delivery.registrations WHERE tenant_id = $1`,
        [tenantId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private _map(row: RegRow): Registration {
    return Registration.reconstitute({
      id: RegistrationId.from(row.id),
      tenantId: row.tenant_id,
      deviceId: DeviceId.from(row.device_id),
      passId: row.pass_id,
      registeredAt: row.created_at,
    });
  }
}

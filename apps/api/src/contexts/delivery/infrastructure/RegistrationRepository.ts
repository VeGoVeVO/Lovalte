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

  /** Dead-token cleanup: drop every registration for a device in one shot. */
  async deleteAllByDevice(deviceId: string): Promise<void> {
    await this.pool.query(`DELETE FROM delivery.registrations WHERE device_id = $1`, [deviceId]);
  }

  async countByDevice(deviceId: string): Promise<number> {
    const r = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM delivery.registrations WHERE device_id = $1`,
      [deviceId],
    );
    return parseInt(r.rows[0].count, 10);
  }

  /**
   * PassKit endpoint 9.2: serial numbers of passes whose last_updated is
   * newer than `sinceMs` (a millisecond epoch tag). When `sinceMs` is
   * undefined, returns all registered serials.
   * Uses `to_timestamp($n / 1000.0)` rather than binding a JS Date so the
   * comparison is exact millisecond precision, not whatever the driver's
   * Date -> timestamptz serialisation rounds to - required so a tag that
   * exactly matches a pass's last_updated is never returned again (strict >).
   */
  async findUpdatedSince(
    deviceLibraryIdentifier: string,
    passTypeIdentifier: string,
    sinceMs?: number,
  ): Promise<UpdatedSerialRow[]> {
    const params: unknown[] = [deviceLibraryIdentifier, passTypeIdentifier];
    const sinceClause = sinceMs !== undefined ? "AND p.last_updated > to_timestamp($3::double precision / 1000.0)" : "";
    if (sinceMs !== undefined) params.push(sinceMs);

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
   * Apple endpoint 9.3: mark every registration for a pass as fetched "now".
   * ponytail: Apple's GetLatestPass request carries no deviceLibraryIdentifier,
   * so a fetch cannot be attributed to a single device - all registrations for
   * the pass are touched together. Ceiling: per-device staleness on the
   * delivery-status dashboard is imprecise when a pass has multiple devices.
   */
  async touchLastFetchedByPass(passId: string): Promise<void> {
    await this.pool.query(
      `UPDATE delivery.registrations SET last_fetched_at = now() WHERE pass_id = $1`,
      [passId],
    );
  }

  /**
   * Reconciliation sweep: passes with registrations that have never fetched
   * (or fetched before) the pass's last update, and with no successful push
   * logged since then. `p.id` is the GROUP BY key, so referencing `p.last_updated`
   * in HAVING is valid (functionally dependent on the primary key).
   */
  async findStalePassIds(): Promise<string[]> {
    const r = await this.pool.query<{ id: string }>(
      `SELECT p.id
       FROM passes p
       JOIN delivery.registrations reg ON reg.pass_id = p.id
       GROUP BY p.id
       HAVING p.last_updated > COALESCE(MAX(reg.last_fetched_at), 'epoch'::timestamptz)
          AND NOT EXISTS (
            SELECT 1 FROM push_log pl
            WHERE pl.pass_id = p.id AND pl.ok = true AND pl.created_at > p.last_updated
          )`,
    );
    return r.rows.map((row) => row.id);
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

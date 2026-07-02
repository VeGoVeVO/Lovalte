import type { Pool } from "pg";
import type { IPushLogRepository, PushLogEntry } from "../domain/ports";

/** Appends one row per APNs push attempt. Read by the reconciliation sweep and the merchant delivery-status query. */
export class PushLogRepository implements IPushLogRepository {
  constructor(private readonly pool: Pool) {}

  async record(entry: PushLogEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO push_log (pass_id, serial_number, push_token, ok, apns_status, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.passId,
        entry.serialNumber,
        entry.pushToken,
        entry.ok,
        entry.apnsStatus ?? null,
        entry.reason ?? null,
      ],
    );
  }
}

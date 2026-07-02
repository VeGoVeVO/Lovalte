import type { Pool } from "pg";
import type { IWalletDeviceLogRepository } from "../domain/ports";

/** Persists the raw Apple Wallet diagnostic log batch (endpoint 9.5) alongside the stdout log. */
export class WalletDeviceLogRepository implements IWalletDeviceLogRepository {
  constructor(private readonly pool: Pool) {}

  async record(logs: string[]): Promise<void> {
    await this.pool.query(`INSERT INTO wallet_device_logs (logs) VALUES ($1::jsonb)`, [
      JSON.stringify(logs),
    ]);
  }
}

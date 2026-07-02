import { Result, ok } from "../../../kernel";
import type { IWalletDeviceLogRepository } from "../domain/ports";

export interface LogDeviceDiagnosticsCommand {
  logs: string[];
}

/**
 * Apple PassKit web-service endpoint 9.5 (no auth required per spec).
 * Forwards Apple Wallet diagnostic log lines to the server's structured logger
 * and persists the raw batch to wallet_device_logs for later review.
 * Always returns 200 - never expose internal details back to the device.
 */
export class LogDeviceDiagnosticsHandler {
  constructor(private readonly repo: IWalletDeviceLogRepository) {}

  async execute(cmd: LogDeviceDiagnosticsCommand): Promise<Result<void, never>> {
    for (const line of cmd.logs) {
      // Structured log - no PII expected here; still sanitised to a single field.
      process.stdout.write(JSON.stringify({ source: "apple-wallet-log", message: line }) + "\n");
    }
    await this.repo.record(cmd.logs);
    return ok(undefined);
  }
}

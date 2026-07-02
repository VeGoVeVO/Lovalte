import { Result, ok } from "../../../kernel";
import type { IDeliveryStatsPort } from "../domain/ports";

export interface GetDeliveryStatusQuery {
  templateId: string;
  tenantId: string;
}

export interface DeliveryStatusDTO {
  passes: number;
  registeredDevices: number;
  upToDateDevices: number;
  staleDevices: number;
  pushFailures24h: number;
  lastPushAt: string | null;
}

/**
 * Merchant-facing verification query: is Apple Wallet delivery actually
 * working for this card template? GET /api/v1/card-templates/:templateId/delivery-status.
 */
export class GetDeliveryStatusHandler {
  constructor(private readonly stats: IDeliveryStatsPort) {}

  async execute(q: GetDeliveryStatusQuery): Promise<Result<DeliveryStatusDTO, never>> {
    const s = await this.stats.getStats(q.templateId, q.tenantId);
    return ok({
      passes: s.passes,
      registeredDevices: s.registeredDevices,
      upToDateDevices: s.upToDateDevices,
      staleDevices: s.staleDevices,
      pushFailures24h: s.pushFailures24h,
      lastPushAt: s.lastPushAt ? s.lastPushAt.toISOString() : null,
    });
  }
}

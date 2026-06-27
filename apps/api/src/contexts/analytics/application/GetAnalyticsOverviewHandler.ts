import { ok } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { IAnalyticsRepository, OverviewDTO } from "./ports";

/**
 * Query handler: compute tenant KPIs from the analytics_events read-model.
 * Returns a Result so the presentation layer can map ok/err without catching.
 */
export class GetAnalyticsOverviewHandler {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(tenantId: string): Promise<Result<OverviewDTO>> {
    const dto = await this.repo.getOverview(tenantId);
    return ok(dto);
  }
}

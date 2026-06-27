import { ok, err, ValidationError } from "../../../kernel";
import type { Result } from "../../../kernel";
import { EVENT_TYPES } from "../domain/AnalyticsEvent";
import type { EventType } from "../domain/AnalyticsEvent";
import type { IAnalyticsRepository, TimeseriesDTO } from "./ports";

export interface TimeseriesInput {
  readonly tenantId: string;
  /** One of the allowed EventType strings. Validated before use. */
  readonly metric: string;
  /** ISO 8601 date-time string for the range start. */
  readonly from: string;
  /** ISO 8601 date-time string for the range end. */
  readonly to: string;
}

/**
 * Query handler: fetch per-day event counts for a given metric and date range.
 * Validates metric and date range before delegating to the read-model port.
 */
export class GetAnalyticsTimeseriesHandler {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(input: TimeseriesInput): Promise<Result<TimeseriesDTO>> {
    if (!(EVENT_TYPES as readonly string[]).includes(input.metric)) {
      return err(
        new ValidationError(
          `Invalid metric "${input.metric}". Allowed: ${EVENT_TYPES.join(", ")}`,
        ),
      );
    }

    const from = new Date(input.from);
    const to = new Date(input.to);

    if (isNaN(from.getTime())) {
      return err(new ValidationError("'from' is not a valid date"));
    }
    if (isNaN(to.getTime())) {
      return err(new ValidationError("'to' is not a valid date"));
    }
    if (from > to) {
      return err(new ValidationError("'from' must not be after 'to'"));
    }

    const series = await this.repo.getTimeseries(
      input.tenantId,
      input.metric as EventType,
      from,
      to,
    );

    return ok({
      metric: input.metric,
      from: from.toISOString(),
      to: to.toISOString(),
      series,
    });
  }
}

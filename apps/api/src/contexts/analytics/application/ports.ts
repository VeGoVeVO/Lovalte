import type { AnalyticsEventData, EventType } from "../domain/AnalyticsEvent";

/** KPI snapshot for the dashboard overview card. */
export interface OverviewDTO {
  readonly totalMembers: number;
  readonly totalScans: number;
  readonly totalRedemptions: number;
  readonly pointsLiability: number;
}

/** One data point in a daily timeseries. */
export interface TimeseriesPoint {
  /** ISO date string "YYYY-MM-DD" */
  readonly day: string;
  readonly count: number;
}

/** Result returned by GetAnalyticsTimeseriesHandler. */
export interface TimeseriesDTO {
  readonly metric: string;
  readonly from: string;
  readonly to: string;
  readonly series: TimeseriesPoint[];
}

/**
 * Port: all analytics read/write operations.
 * Implemented by AnalyticsRepository in the infrastructure layer.
 * Application handlers depend only on this interface — never on pg directly.
 */
export interface IAnalyticsRepository {
  /** Append a single analytics fact (idempotency not enforced here — events are naturally ordered). */
  insertEvent(data: AnalyticsEventData): Promise<void>;

  /** Compute KPI aggregates for a tenant on-the-fly (GROUP BY, tenant-scoped). */
  getOverview(tenantId: string): Promise<OverviewDTO>;

  /** Count events of `metric` type per day within [from, to]. */
  getTimeseries(
    tenantId: string,
    metric: EventType,
    from: Date,
    to: Date,
  ): Promise<TimeseriesPoint[]>;
}

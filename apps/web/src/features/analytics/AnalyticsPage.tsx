import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../../lib/AppShell";
import { GlassCard } from "../../design-system/halo";
import { api } from "../../lib/api";
import { MetricsChart } from "./MetricsChart";
import type { TimeseriesPoint } from "./MetricsChart";

/* ─── types ─────────────────────────────────────────────────────────── */

type Overview = {
  totalMembers: number;
  totalScans: number;
  totalRedemptions: number;
  pointsLiability: number;
};

type TimeseriesDTO = {
  metric: string;
  from: string;
  to: string;
  series: TimeseriesPoint[];
};

/* ─── constants ──────────────────────────────────────────────────────── */

const METRICS = [
  { value: "scan", label: "Scans" },
  { value: "redeem", label: "Redemptions" },
  { value: "points_earned", label: "Points Earned" },
  { value: "points_redeemed", label: "Points Redeemed" },
  { value: "pass_issued", label: "Passes Issued" },
] as const;

type MetricValue = (typeof METRICS)[number]["value"];

const DAY_OPTIONS = [7, 14, 30, 90] as const;

const KPIS: Array<{ key: keyof Overview; label: string }> = [
  { key: "totalMembers", label: "Total Members" },
  { key: "totalScans", label: "Total Scans" },
  { key: "totalRedemptions", label: "Redemptions" },
  { key: "pointsLiability", label: "Points Liability" },
];

/* ─── helpers ────────────────────────────────────────────────────────── */

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/* ─── responsive grid style injected once ───────────────────────────── */

const kpiGridCss = `
  .analytics-kpi-grid { grid-template-columns: repeat(4, 1fr) !important; }
  @media (max-width: 900px) {
    .analytics-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
  @media (max-width: 480px) {
    .analytics-kpi-grid { grid-template-columns: 1fr !important; }
  }
`;

/* ─── component ──────────────────────────────────────────────────────── */

export function AnalyticsPage() {
  const [metric, setMetric] = useState<MetricValue>("scan");
  const [days, setDays] = useState<number>(30);

  const from = isoDate(daysAgo(days));
  const to = isoDate(new Date());

  const overview = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => api.get<Overview>("/api/v1/analytics/overview"),
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  const timeseries = useQuery({
    queryKey: ["analytics-timeseries", metric, from, to],
    queryFn: () =>
      api.get<TimeseriesDTO>(
        `/api/v1/analytics/timeseries?metric=${metric}&from=${from}&to=${to}`,
      ),
    staleTime: 60_000,
  });

  const metricLabel =
    METRICS.find((m) => m.value === metric)?.label ?? metric;

  return (
    <AppShell title="Analytics">
      <style>{kpiGridCss}</style>

      {/* ── KPI cards ──────────────────────────────────────────────── */}
      <section aria-labelledby="analytics-kpi-heading">
        <h2
          id="analytics-kpi-heading"
          className="eyebrow"
          style={{ marginBottom: "1rem" }}
        >
          Overview
        </h2>

        {overview.isError && (
          <div role="alert" className="glass feature" style={{ marginBottom: "1.5rem" }}>
            <p className="body" style={{ margin: 0 }}>
              Unable to load overview data — please refresh or sign in.
            </p>
          </div>
        )}

        <ul
          className="grid-3 analytics-kpi-grid"
          style={{ gap: "1.5rem", listStyle: "none", padding: 0, margin: "0 0 2.5rem" }}
          aria-label="Key performance indicators"
        >
          {KPIS.map((kpi) => {
            const value = overview.data?.[kpi.key];
            const displayValue =
              overview.isLoading
                ? "—"
                : overview.isError
                ? "—"
                : (value ?? 0).toLocaleString();

            return (
              <li key={kpi.key}>
                <GlassCard hover light className="meta">
                  <div
                    className="n"
                    aria-label={`${kpi.label}: ${overview.isLoading ? "loading" : displayValue}`}
                    aria-busy={overview.isLoading}
                  >
                    {displayValue}
                  </div>
                  <div className="l">{kpi.label}</div>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Timeseries chart ───────────────────────────────────────── */}
      <GlassCard className="feature">
        {/* Controls header */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1.25rem",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "1.75rem",
          }}
        >
          <h2 className="cardt" id="chart-heading">
            {metricLabel} over time
          </h2>

          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}
          >
            {/* Metric selector */}
            <div role="group" aria-labelledby="metric-group-label">
              <span
                id="metric-group-label"
                className="eyebrow"
                style={{ display: "block", marginBottom: ".5rem" }}
              >
                Metric
              </span>
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                {METRICS.map((m) => (
                  <button
                    key={m.value}
                    className={`btn${metric === m.value ? "" : " ghost"}`}
                    style={{ padding: ".4rem .8rem", fontSize: ".85rem" }}
                    onClick={() => setMetric(m.value)}
                    aria-pressed={metric === m.value}
                    type="button"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range selector */}
            <div role="group" aria-labelledby="range-group-label">
              <span
                id="range-group-label"
                className="eyebrow"
                style={{ display: "block", marginBottom: ".5rem" }}
              >
                Range
              </span>
              <div style={{ display: "flex", gap: ".4rem" }}>
                {DAY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    className={`btn${days === d ? "" : " ghost"}`}
                    style={{ padding: ".4rem .7rem", fontSize: ".85rem" }}
                    onClick={() => setDays(d)}
                    aria-pressed={days === d}
                    aria-label={`Last ${d} days`}
                    type="button"
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <MetricsChart
          data={timeseries.data?.series ?? []}
          metricLabel={metricLabel}
          isLoading={timeseries.isLoading}
          isError={timeseries.isError}
        />
      </GlassCard>
    </AppShell>
  );
}

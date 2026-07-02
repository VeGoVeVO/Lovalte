import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../../lib/AppShell";
import { GlassCard } from "../../design-system/halo";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { MetricsChart } from "./MetricsChart";
import type { TimeseriesPoint } from "./MetricsChart";

/* ─── analytics types ────────────────────────────────────────────── */

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

/* ─── constants ──────────────────────────────────────────────────── */

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

/* ─── helpers ────────────────────────────────────────────────────── */

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/* ─── styles ─────────────────────────────────────────────────────── */

const layoutCss = `
.lvt-analytics-main {
  min-width:0;
  height:min(680px, calc(100dvh - 9.5rem));
  min-height:520px;
  display:grid;
  grid-template-rows:auto minmax(0,1fr);
  gap:1rem;
  overflow:hidden;
}
.lvt-analytics-main .feature { min-height:0; overflow:hidden; }
.lvt-chart-controls { display:flex; flex-wrap:wrap; gap:.75rem; align-items:center; justify-content:space-between; margin-bottom:.9rem; }
.lvt-chart-buttons { display:flex; gap:.35rem; flex-wrap:wrap; }
.lvt-chart-buttons .btn { padding:.34rem .64rem; font-size:.8rem; min-height:34px; }
.lvt-analytics-chart { display:flex; flex-direction:column; min-height:0; }
.lvt-analytics-chart .recharts-responsive-container { min-height:0; }
@media (max-width: 1180px) {
  .lvt-analytics-main { height:auto; min-height:0; overflow:visible; }
}
@media (max-width: 900px) {
  .lvt-kpi-grid { grid-template-columns: repeat(2,1fr) !important; }
}
@media (max-width: 560px) {
  .lvt-pageview:has(.lvt-analytics-main) {
    height:calc(100dvh - 58px - 1rem - 58px - env(safe-area-inset-bottom, 0px) - .85rem - env(safe-area-inset-top, 0px));
    min-height:0;
    display:flex;
    flex-direction:column;
    overflow:hidden;
  }
  .lvt-analytics-main {
    flex:1 1 auto;
    height:auto;
    min-height:0;
    grid-template-rows:auto minmax(0,1fr);
    gap:.64rem;
    overflow:hidden;
  }
  .lvt-analytics-main section { min-height:0; }
  .lvt-analytics-main .eyebrow { margin-bottom:.58rem !important; }
  .lvt-kpi-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; gap:.7rem !important; margin-bottom:0 !important; }
  .lvt-kpi-grid .meta { min-width:0; padding:.66rem .72rem; border-radius:16px; }
  .lvt-kpi-grid .meta .n { font-size:1.24rem; line-height:1.02; }
  .lvt-kpi-grid .meta .l { font-size:.68rem; line-height:1.15; margin-top:.22rem; }
  .lvt-analytics-chart { padding:.72rem !important; border-radius:18px; }
  .lvt-chart-controls { gap:.42rem; margin-bottom:.44rem; }
  .lvt-chart-controls .cardt { font-size:.92rem; line-height:1.1; }
  .lvt-chart-buttons { gap:.24rem; }
  .lvt-chart-buttons .btn { min-height:28px; padding:.24rem .45rem; font-size:.69rem; border-radius:11px; }
}
@media (prefers-reduced-motion: reduce) {
  .lvt-analytics-main * { animation:none !important; transition:none !important; }
}
`;

/* ─── page ───────────────────────────────────────────────────────── */

export function AnalyticsPage() {
  const { t } = useT();
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
      api.get<TimeseriesDTO>(`/api/v1/analytics/timeseries?metric=${metric}&from=${from}&to=${to}`),
    staleTime: 60_000,
  });

  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? metric;

  return (
    <AppShell title={t("Analytics")}>
      <style>{layoutCss}</style>

      <div className="lvt-analytics-main">
        {/* ── KPI cards ──────────────────────────────────────── */}
        <section aria-labelledby="analytics-kpi-heading">
          <h2 id="analytics-kpi-heading" className="eyebrow" style={{ marginBottom: "1rem" }}>
            {t("Overview")}
          </h2>

          {overview.isError && (
            <GlassCard role="alert" style={{ padding: "0.85rem 1.1rem", marginBottom: "1.5rem" }}>
              <p className="body" style={{ margin: 0 }}>
                {t("Unable to load overview data - please refresh or sign in.")}
              </p>
            </GlassCard>
          )}

          <ul
            role="list"
            className="lvt-kpi-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: "1rem",
              listStyle: "none",
              padding: 0,
              margin: "0",
            }}
            aria-label={t("Key performance indicators")}
          >
            {KPIS.map((kpi) => {
              const value = overview.data?.[kpi.key];
              const displayValue = overview.isLoading
                ? "-"
                : overview.isError
                  ? "-"
                  : (value ?? 0).toLocaleString();

              return (
                <li key={kpi.key}>
                  <GlassCard hover light className="meta">
                    <div
                      className="n"
                      aria-label={`${t(kpi.label)}: ${overview.isLoading ? t("loading") : displayValue}`}
                      aria-busy={overview.isLoading}
                    >
                      {displayValue}
                    </div>
                    <div className="l">{t(kpi.label)}</div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Timeseries chart ───────────────────────────────── */}
        <GlassCard className="feature lvt-analytics-chart">
          <div className="lvt-chart-controls">
            <h2 className="cardt" id="chart-heading">
              {t("{label} over time", { label: t(metricLabel) })}
            </h2>

            <div
              style={{ display: "flex", flexWrap: "wrap", gap: ".55rem", alignItems: "flex-start" }}
            >
              {/* Metric selector */}
              <div role="group" aria-labelledby="metric-group-label">
                <span
                  id="metric-group-label"
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clip: "rect(0,0,0,0)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("Metric")}
                </span>
                <div className="lvt-chart-buttons">
                  {METRICS.map((m) => (
                    <button
                      key={m.value}
                      className={`btn${metric === m.value ? "" : " ghost"}`}
                      onClick={() => setMetric(m.value)}
                      aria-pressed={metric === m.value}
                      type="button"
                    >
                      {t(m.label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range selector */}
              <div role="group" aria-labelledby="range-group-label">
                <span
                  id="range-group-label"
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clip: "rect(0,0,0,0)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("Range")}
                </span>
                <div className="lvt-chart-buttons">
                  {DAY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      className={`btn${days === d ? "" : " ghost"}`}
                      onClick={() => setDays(d)}
                      aria-pressed={days === d}
                      aria-label={t("Last {n} days", { n: d })}
                      type="button"
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <MetricsChart
            data={timeseries.data?.series ?? []}
            metricLabel={t(metricLabel)}
            isLoading={timeseries.isLoading}
            isError={timeseries.isError}
            compact
          />
        </GlassCard>
      </div>
    </AppShell>
  );
}

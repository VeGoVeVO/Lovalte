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

/* ─── staff types (sidebar read-only list) ───────────────────────── */

type UserRole = "owner" | "manager" | "staff";
type UserStatus = "active" | "invited" | "suspended";

interface UserDTO {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

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

const ROLE_BG: Record<UserRole, string> = {
  owner: "var(--mint)",
  manager: "var(--lavender)",
  staff: "var(--ice)",
};

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

const kpiGridCss = `
  .analytics-kpi-grid { grid-template-columns: repeat(4, 1fr) !important; }
  @media (max-width: 900px) {
    .analytics-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
  @media (max-width: 480px) {
    .analytics-kpi-grid { grid-template-columns: 1fr !important; }
  }
`;

const layoutCss = `
@keyframes lvt-staff-in {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
.lvt-analytics-wrap {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  width: 100%;
}
.lvt-analytics-main {
  flex: 1;
  min-width: 0;
}
.lvt-staff-sidebar {
  flex-shrink: 0;
  width: 0;
  overflow: hidden;
  transition: width 360ms cubic-bezier(.22,1,.36,1);
}
.lvt-staff-sidebar.open {
  width: 284px;
}
.lvt-staff-inner {
  width: 284px;
  animation: lvt-staff-in 360ms cubic-bezier(.22,1,.36,1) both;
}
.lvt-team-btn {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  font-size: .85rem;
  font-weight: 500;
  padding: .42rem .9rem;
  border-radius: var(--r-pill);
  border: 1px solid rgba(255,255,255,.65);
  background: rgba(255,255,255,.45);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  backdrop-filter: blur(16px) saturate(160%);
  box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 2px 8px -4px rgba(46,62,92,.12);
  cursor: pointer;
  color: var(--text);
  transition: background 220ms ease, transform 180ms ease, box-shadow 220ms ease;
}
.lvt-team-btn:hover {
  background: rgba(255,255,255,.62);
  transform: translateY(-1px);
  box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 4px 14px -6px rgba(46,62,92,.18);
}
.lvt-team-btn.active {
  background: rgba(200,238,255,.38);
  border-color: rgba(169,245,255,.55);
}
@media (max-width: 767px) {
  .lvt-analytics-wrap { flex-direction: column; }
  .lvt-staff-sidebar.open { width: 100%; }
  .lvt-staff-inner { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .lvt-staff-sidebar, .lvt-staff-inner {
    transition: none !important;
    animation: none !important;
  }
}
`;

/* ─── staff sidebar ──────────────────────────────────────────────── */

function StaffSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { data: users, isLoading, isError } = useQuery({
    queryKey: ["staff-users"],
    queryFn: () => api.get<UserDTO[]>("/api/v1/users"),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <aside
      className={`lvt-staff-sidebar${open ? " open" : ""}`}
      aria-label={t("Team")}
      aria-hidden={!open}
    >
      {open && (
        <div className="lvt-staff-inner">
          <GlassCard light className="feature" style={{ padding: "1.25rem 1.1rem" }}>
            {/* header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h2 className="cardt" style={{ fontSize: "1rem" }}>
                {t("Team")}
              </h2>
              <button
                type="button"
                className="btn ghost"
                onClick={onClose}
                aria-label={t("Close team panel")}
                style={{ padding: "0.3rem 0.55rem", fontSize: "0.82rem", lineHeight: 1 }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
              </button>
            </div>

            {/* list */}
            {isLoading ? (
              <p className="body" aria-busy="true" style={{ fontSize: "0.85rem", margin: 0 }}>
                {t("Loading…")}
              </p>
            ) : isError ? (
              <p className="body" role="alert" style={{ fontSize: "0.82rem", margin: 0 }}>
                {t("Could not load team.")}
              </p>
            ) : !users?.length ? (
              <p className="body" style={{ fontSize: "0.85rem", margin: 0 }}>
                {t("No team members yet.")}
              </p>
            ) : (
              <ul
                role="list"
                aria-label={t("Team members")}
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.45rem",
                }}
              >
                {users.map((user) => (
                  <li key={user.userId}>
                    <div
                      className="glass"
                      style={{
                        padding: "0.7rem 0.9rem",
                        borderRadius: "14px",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: "0.86rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {user.email}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.35rem",
                          marginTop: "0.3rem",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.66rem",
                            fontWeight: 600,
                            padding: "0.15rem 0.5rem",
                            borderRadius: "var(--r-pill)",
                            background: ROLE_BG[user.role] ?? "rgba(0,0,0,.06)",
                            color: "var(--text)",
                            textTransform: "capitalize",
                            letterSpacing: "0.01em",
                          }}
                        >
                          {user.role}
                        </span>
                        {user.status !== "active" && (
                          <span
                            style={{
                              fontSize: "0.63rem",
                              color: "var(--muted)",
                              padding: "0.1rem 0.45rem",
                              borderRadius: "var(--r-pill)",
                              background: "rgba(0,0,0,.05)",
                              textTransform: "capitalize",
                            }}
                          >
                            {user.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      )}
    </aside>
  );
}

/* ─── page ───────────────────────────────────────────────────────── */

export function AnalyticsPage() {
  const { t } = useT();
  const [metric, setMetric] = useState<MetricValue>("scan");
  const [days, setDays] = useState<number>(30);
  const [staffOpen, setStaffOpen] = useState(false);

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
      <style>{kpiGridCss}</style>
      <style>{layoutCss}</style>

      {/* team toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
        <button
          type="button"
          className={`lvt-team-btn${staffOpen ? " active" : ""}`}
          onClick={() => setStaffOpen((o) => !o)}
          aria-expanded={staffOpen}
          aria-controls="staff-sidebar"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M20.5 19a5 5 0 0 0-3-4.5" />
          </svg>
          {t("Team")}
        </button>
      </div>

      {/* main layout: analytics content + staff sidebar */}
      <div className="lvt-analytics-wrap">
        <div className="lvt-analytics-main">
          {/* ── KPI cards ──────────────────────────────────────── */}
          <section aria-labelledby="analytics-kpi-heading">
            <h2 id="analytics-kpi-heading" className="eyebrow" style={{ marginBottom: "1rem" }}>
              {t("Overview")}
            </h2>

            {overview.isError && (
              <div role="alert" className="glass feature" style={{ marginBottom: "1.5rem" }}>
                <p className="body" style={{ margin: 0 }}>
                  {t("Unable to load overview data - please refresh or sign in.")}
                </p>
              </div>
            )}

            <ul
              className="grid-3 analytics-kpi-grid"
              style={{ gap: "1.5rem", listStyle: "none", padding: 0, margin: "0 0 2.5rem" }}
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
          <GlassCard className="feature">
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
                {t("{label} over time", { label: t(metricLabel) })}
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
                    {t("Metric")}
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
                        {t(m.label)}
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
                    {t("Range")}
                  </span>
                  <div style={{ display: "flex", gap: ".4rem" }}>
                    {DAY_OPTIONS.map((d) => (
                      <button
                        key={d}
                        className={`btn${days === d ? "" : " ghost"}`}
                        style={{ padding: ".4rem .7rem", fontSize: ".85rem" }}
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
            />
          </GlassCard>
        </div>

        {/* ── staff sidebar ──────────────────────────────────── */}
        <StaffSidebar open={staffOpen} onClose={() => setStaffOpen(false)} />
      </div>
    </AppShell>
  );
}

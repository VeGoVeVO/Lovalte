import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { GlassCard, GlassButton } from "../../design-system/halo";
import type { Member } from "./MembersPage";
import { useT } from "../../lib/i18n";

// ── types ────────────────────────────────────────────────────────────────────
type ActivityEntry = {
  delta: number;
  reason: string;
  createdAt: string;
};
type ActivityPage = {
  items: ActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export interface MemberDetailProps {
  memberId: string;
  onBack: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const TH: React.CSSProperties = {
  padding: "0.75rem 1.25rem",
  textAlign: "left",
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--muted)",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = { padding: "0.9rem 1.25rem", verticalAlign: "middle" };

// ── component ─────────────────────────────────────────────────────────────────
export function MemberDetail({ memberId, onBack }: MemberDetailProps) {
  const { t } = useT();
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const memberQ = useQuery<Member, ApiError>({
    queryKey: ["member", memberId],
    queryFn: () => api.get<Member>(`/api/v1/members/${memberId}`),
  });

  const activityQ = useQuery<ActivityPage, ApiError>({
    queryKey: ["member-activity", memberId, page],
    queryFn: () =>
      api.get<ActivityPage>(
        `/api/v1/members/${memberId}/activity?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
  });

  const m = memberQ.data;
  const act = activityQ.data;
  const totalPages = act ? Math.max(1, Math.ceil(act.total / PAGE_SIZE)) : 1;

  return (
    <div>
      {/* Back */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          className="btn ghost"
          onClick={onBack}
          aria-label={t("Back to members list")}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", padding: "0.55rem 0.9rem" }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          {t("Members")}
        </button>
      </div>

      {/* Profile card */}
      {memberQ.isError ? (
        <GlassCard className="feature" style={{ marginBottom: "1.5rem" }}>
          <p role="alert" style={{ margin: 0, color: "var(--muted)" }}>
            {t("Could not load member: {message}", { message: (memberQ.error as ApiError)?.message ?? t("Unknown error") })}
          </p>
        </GlassCard>
      ) : (
        <GlassCard hover light className="feature" style={{ marginBottom: "1.5rem" }}>
          {memberQ.isLoading ? (
            <p aria-live="polite" style={{ margin: 0, color: "var(--muted)" }}>{t("Loading…")}</p>
          ) : (
            <>
              <h2 style={{ margin: "0 0 1.25rem", fontSize: "1.55rem", fontWeight: 600,
                letterSpacing: "-.025em", color: "var(--text)" }}>
                {m?.displayName ?? m?.email ?? t("Member")}
              </h2>
              <dl style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap", margin: 0 }}>
                {m?.email && (
                  <div>
                    <dt style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.3rem" }}>
                      {t("Email")}
                    </dt>
                    <dd style={{ margin: 0 }}>{m.email}</dd>
                  </div>
                )}
                <div>
                  <dt style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.3rem" }}>
                    {t("Balance")}
                  </dt>
                  <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>
                    {m?.balance?.toLocaleString() ?? "-"}&thinsp;pts
                  </dd>
                </div>
                <div>
                  <dt style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.3rem" }}>
                    {t("Tier")}
                  </dt>
                  <dd style={{ margin: 0, textTransform: "capitalize" }}>
                    {m?.tier ?? "-"}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </GlassCard>
      )}

      {/* Activity ledger */}
      <h3 style={{ margin: "0 0 1rem", fontSize: "0.72rem", fontWeight: 600,
        letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>
        {t("Activity")}
      </h3>

      {activityQ.isError ? (
        <GlassCard className="feature">
          <p role="alert" style={{ margin: 0, color: "var(--muted)" }}>
            {t("Could not load activity: {message}", { message: (activityQ.error as ApiError)?.message ?? t("Unknown error") })}
          </p>
        </GlassCard>
      ) : activityQ.isLoading ? (
        <GlassCard className="feature">
          <p aria-live="polite" style={{ margin: 0, color: "var(--muted)" }}>
            {t("Loading activity…")}
          </p>
        </GlassCard>
      ) : !act?.items?.length ? (
        <GlassCard className="feature" style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>{t("No activity recorded yet.")}</p>
        </GlassCard>
      ) : (
        <>
          <GlassCard className="feature" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table
                aria-label={t("Activity ledger")}
                style={{ width: "100%", borderCollapse: "collapse", minWidth: "26rem" }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(32,36,42,0.08)" }}>
                    <th scope="col" style={TH}>{t("Date")}</th>
                    <th scope="col" style={TH}>{t("Reason")}</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>{t("Points")}</th>
                  </tr>
                </thead>
                <tbody>
                  {act.items.map((entry) => (
                    <tr
                      key={`${entry.createdAt}-${entry.reason}-${entry.delta}`}
                      style={{ borderBottom: "1px solid rgba(32,36,42,0.05)" }}
                    >
                      <td style={{ ...TD, color: "var(--muted)", fontSize: "0.85rem",
                        whiteSpace: "nowrap" }}>
                        {fmt(entry.createdAt)}
                      </td>
                      <td style={TD}>{entry.reason}</td>
                      <td
                        style={{
                          ...TD,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color: entry.delta >= 0 ? "#1a7a45" : "#b93333",
                        }}
                        aria-label={t("{delta} points", { delta: `${entry.delta >= 0 ? "+" : ""}${entry.delta.toLocaleString()}` })}
                      >
                        {entry.delta >= 0 ? "+" : ""}
                        {entry.delta.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav
              aria-label={t("Activity pagination")}
              style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginTop: "1rem", gap: "1rem" }}
            >
              <button
                className="btn ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={t("Previous page")}
                aria-disabled={page <= 1}
                style={{ opacity: page <= 1 ? 0.4 : 1 }}
              >
                {t("← Previous")}
              </button>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}
                aria-live="polite" aria-atomic="true">
                {t("Page {page} of {totalPages}", { page, totalPages })}
              </span>
              <button
                className="btn ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label={t("Next page")}
                aria-disabled={page >= totalPages}
                style={{ opacity: page >= totalPages ? 0.4 : 1 }}
              >
                {t("Next →")}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

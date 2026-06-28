import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, Icon } from "../../design-system/halo";
import { MemberDetail } from "./MemberDetail";
import { useT } from "../../lib/i18n";

// ── types (exported so MemberDetail can share) ────────────────────────────────
export type Member = {
  id: string;
  displayName?: string;
  email?: string;
  balance: number;
  tier: string;
};

// ── style constants ───────────────────────────────────────────────────────────
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

// ── TierBadge ─────────────────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.18em 0.65em",
        borderRadius: "9999px",
        fontSize: "0.7rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "capitalize",
        background: "rgba(32,36,42,0.07)",
        color: "var(--text)",
        border: "1px solid rgba(32,36,42,0.1)",
      }}
    >
      {tier}
    </span>
  );
}

// ── MemberListView ────────────────────────────────────────────────────────────
function MemberListView({ onSelect }: { onSelect: (id: string) => void }) {
  const { t } = useT();
  const {
    data: members,
    isLoading,
    isError,
    error,
  } = useQuery<Member[], ApiError>({
    queryKey: ["members"],
    queryFn: () => api.get<Member[]>("/api/v1/members"),
  });

  if (isError) {
    return (
      <GlassCard className="feature">
        <p role="alert" style={{ margin: 0, color: "var(--muted)" }}>
          {t("Failed to load members: {message}", {
            message: (error as ApiError)?.message ?? t("Unknown error"),
          })}
        </p>
      </GlassCard>
    );
  }

  if (isLoading) {
    return (
      <GlassCard className="feature">
        <p
          aria-live="polite"
          aria-label={t("Loading members")}
          style={{ margin: 0, color: "var(--muted)" }}
        >
          {t("Loading…")}
        </p>
      </GlassCard>
    );
  }

  if (!members?.length) {
    return (
      <GlassCard className="feature" style={{ textAlign: "center", padding: "5rem 2rem" }}>
        <p style={{ margin: "0 0 0.5rem", fontSize: "1.05rem", fontWeight: 500 }}>
          {t("No members yet - issue a card to get started.")}
        </p>
        <p className="body" style={{ margin: 0 }}>
          {t("Members appear here once a loyalty card has been issued to a customer.")}
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="feature" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table
          aria-label={t("Members")}
          style={{ width: "100%", borderCollapse: "collapse", minWidth: "38rem" }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(32,36,42,0.08)" }}>
              <th scope="col" style={TH}>
                {t("Name")}
              </th>
              <th scope="col" style={TH}>
                {t("Email")}
              </th>
              <th scope="col" style={{ ...TH, textAlign: "right" }}>
                {t("Balance")}
              </th>
              <th scope="col" style={TH}>
                {t("Tier")}
              </th>
              <th scope="col" style={{ ...TH, width: "3.5rem", textAlign: "center" }}>
                {/* icon-only column - label provided on each action button */}
                <span
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0,0,0,0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }}
                >
                  {t("Actions")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid rgba(32,36,42,0.05)" }}>
                <td style={{ ...TD, fontWeight: 500 }}>
                  {m.displayName ?? <span style={{ color: "var(--muted)" }}>-</span>}
                </td>
                <td style={{ ...TD, color: "var(--muted)", fontSize: "0.9rem" }}>
                  {m.email ?? <span style={{ opacity: 0.5 }}>-</span>}
                </td>
                <td
                  style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  aria-label={t("{balance} points", { balance: m.balance.toLocaleString() })}
                >
                  {m.balance.toLocaleString()}&thinsp;pts
                </td>
                <td style={TD}>
                  <TierBadge tier={m.tier} />
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <button
                    className="btn ghost"
                    aria-label={t("View details for {name}", {
                      name: m.displayName ?? m.email ?? t("member"),
                    })}
                    onClick={() => onSelect(m.id)}
                    style={{ padding: "0.4rem 0.55rem", lineHeight: 1, display: "inline-flex" }}
                  >
                    <Icon.Arrow aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          padding: "0.75rem 1.25rem",
          borderTop: "1px solid rgba(32,36,42,0.06)",
          fontSize: "0.82rem",
          color: "var(--muted)",
        }}
        aria-live="polite"
      >
        {t("{count} members", { count: members.length })}
      </div>
    </GlassCard>
  );
}

// ── MembersPage (named export) ────────────────────────────────────────────────
export function MembersPage() {
  const { t } = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <AppShell title={selectedId ? undefined : t("Members")}>
      {selectedId ? (
        <MemberDetail memberId={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <MemberListView onSelect={setSelectedId} />
      )}
    </AppShell>
  );
}

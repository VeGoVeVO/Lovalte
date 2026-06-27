import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, Icon } from "../../design-system/halo";
import { MemberDetail } from "./MemberDetail";

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
  const { data: members, isLoading, isError, error } = useQuery<Member[], ApiError>({
    queryKey: ["members"],
    queryFn: () => api.get<Member[]>("/api/v1/members"),
  });

  if (isError) {
    return (
      <GlassCard className="feature">
        <p role="alert" style={{ margin: 0, color: "var(--muted)" }}>
          Failed to load members:{" "}
          {(error as ApiError)?.message ?? "Unknown error"}
        </p>
      </GlassCard>
    );
  }

  if (isLoading) {
    return (
      <GlassCard className="feature">
        <p aria-live="polite" aria-label="Loading members" style={{ margin: 0, color: "var(--muted)" }}>
          Loading…
        </p>
      </GlassCard>
    );
  }

  if (!members?.length) {
    return (
      <GlassCard className="feature" style={{ textAlign: "center", padding: "5rem 2rem" }}>
        <p style={{ margin: "0 0 0.5rem", fontSize: "1.05rem", fontWeight: 500 }}>
          No members yet — issue a card to get started.
        </p>
        <p className="body" style={{ margin: 0 }}>
          Members appear here once a loyalty card has been issued to a customer.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="feature" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table
          aria-label="Members"
          style={{ width: "100%", borderCollapse: "collapse", minWidth: "38rem" }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(32,36,42,0.08)" }}>
              <th scope="col" style={TH}>Name</th>
              <th scope="col" style={TH}>Email</th>
              <th scope="col" style={{ ...TH, textAlign: "right" }}>Balance</th>
              <th scope="col" style={TH}>Tier</th>
              <th scope="col" style={{ ...TH, width: "3.5rem", textAlign: "center" }}>
                {/* icon-only column — label provided on each action button */}
                <span style={{
                  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
                  overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
                }}>
                  Actions
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.id}
                style={{ borderBottom: "1px solid rgba(32,36,42,0.05)" }}
              >
                <td style={{ ...TD, fontWeight: 500 }}>
                  {m.displayName ?? <span style={{ color: "var(--muted)" }}>—</span>}
                </td>
                <td style={{ ...TD, color: "var(--muted)", fontSize: "0.9rem" }}>
                  {m.email ?? <span style={{ opacity: 0.5 }}>—</span>}
                </td>
                <td
                  style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  aria-label={`${m.balance.toLocaleString()} points`}
                >
                  {m.balance.toLocaleString()}&thinsp;pts
                </td>
                <td style={TD}>
                  <TierBadge tier={m.tier} />
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <button
                    className="btn ghost"
                    aria-label={`View details for ${m.displayName ?? m.email ?? "member"}`}
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
        {members.length} member{members.length !== 1 ? "s" : ""}
      </div>
    </GlassCard>
  );
}

// ── MembersPage (named export) ────────────────────────────────────────────────
export function MembersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <AppShell title={selectedId ? undefined : "Members"}>
      {selectedId ? (
        <MemberDetail memberId={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <MemberListView onSelect={setSelectedId} />
      )}
    </AppShell>
  );
}

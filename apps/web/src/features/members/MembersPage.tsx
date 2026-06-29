import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, Icon } from "../../design-system/halo";
import { MemberDetail } from "./MemberDetail";
import { useT } from "../../lib/i18n";

// Members are scoped PER CARD: each published card has its own members, shown with
// that card's real progress (stamps / points / cashback) — no tiers, no name/email.
export type Member = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  balance: number;
  enrolledAt?: string;
};

type CardLite = {
  id: string;
  name: string;
  status: "draft" | "published";
  rewardRule: { cardType?: "points" | "stamps" | "cashback"; rewardThreshold?: number };
};

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

/** Format a member's balance in the card's own terms — matches the pass. */
function progress(card: CardLite, balance: number): string {
  const type = card.rewardRule.cardType ?? "points";
  const goal = card.rewardRule.rewardThreshold ?? 10;
  if (type === "stamps") return `${Math.min(Math.max(balance, 0), goal)} / ${goal}`;
  if (type === "cashback") return `$${Number(balance).toFixed(2)}`;
  return `${balance.toLocaleString()} pts`;
}

const PROGRESS_LABEL: Record<string, string> = {
  stamps: "Stamps",
  cashback: "Balance",
  points: "Points",
};

// ── Card picker ────────────────────────────────────────────────────────────────
function CardPicker({ onPick }: { onPick: (card: CardLite) => void }) {
  const { t } = useT();
  const { data, isLoading, isError } = useQuery<CardLite[], ApiError>({
    queryKey: ["card-templates"],
    queryFn: () => api.get<CardLite[]>("/api/v1/card-templates"),
  });
  const cards = (data ?? []).filter((c) => c.status === "published");

  if (isLoading)
    return (
      <GlassCard style={{ padding: "1.25rem 1.5rem" }}>
        <p style={{ margin: 0, color: "var(--muted)" }}>{t("Loading…")}</p>
      </GlassCard>
    );
  if (isError)
    return (
      <GlassCard style={{ padding: "1.25rem 1.5rem" }} role="alert">
        <p style={{ margin: 0, color: "var(--text)" }}>{t("Failed to load cards.")}</p>
      </GlassCard>
    );
  if (!cards.length)
    return (
      <GlassCard style={{ padding: "3rem 2rem", textAlign: "center" }}>
        <p style={{ margin: "0 0 0.4rem", fontSize: "1.05rem", fontWeight: 500 }}>
          {t("No published cards yet.")}
        </p>
        <p className="body" style={{ margin: 0 }}>
          {t("Publish a card in the Builder, then issue it to start enrolling members.")}
        </p>
      </GlassCard>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <p className="body" style={{ margin: 0, color: "var(--muted)", textAlign: "center" }}>
        {t("Pick a card to see its members.")}
      </p>
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          className="glass glass-hover"
          onClick={() => onPick(c)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            width: "100%",
            textAlign: "left",
            padding: "1rem 1.25rem",
            borderRadius: "var(--r-card)",
            cursor: "pointer",
            font: "inherit",
            color: "var(--text)",
          }}
        >
          <span style={{ fontWeight: 600 }}>{c.name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span className="eyebrow">
              {t(PROGRESS_LABEL[c.rewardRule.cardType ?? "points"] ?? "Points")}
            </span>
            <Icon.Arrow aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Member list for one card ─────────────────────────────────────────────────────
function MembersForCard({
  card,
  onBack,
  onSelect,
}: {
  card: CardLite;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useT();
  const { data, isLoading, isError } = useQuery<Member[], ApiError>({
    queryKey: ["members", card.id],
    queryFn: () => api.get<Member[]>(`/api/v1/members?cardTemplateId=${card.id}`),
  });
  const members = data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <button
        type="button"
        className="btn ghost"
        onClick={onBack}
        style={{ alignSelf: "flex-start" }}
      >
        ← {t("All cards")}
      </button>

      {isLoading ? (
        <GlassCard style={{ padding: "1.25rem 1.5rem" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>{t("Loading…")}</p>
        </GlassCard>
      ) : isError ? (
        <GlassCard style={{ padding: "1.25rem 1.5rem" }} role="alert">
          <p style={{ margin: 0 }}>{t("Failed to load members.")}</p>
        </GlassCard>
      ) : !members.length ? (
        <GlassCard style={{ padding: "3rem 2rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.4rem", fontSize: "1.05rem", fontWeight: 500 }}>
            {t("No members yet on this card.")}
          </p>
          <p className="body" style={{ margin: 0 }}>
            {t("Members appear here once this card is issued to a customer.")}
          </p>
        </GlassCard>
      ) : (
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table
              aria-label={t("Members of {name}", { name: card.name })}
              style={{ width: "100%", borderCollapse: "collapse", minWidth: "28rem" }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th scope="col" style={{ ...TH, textAlign: "right" }}>
                    {t(PROGRESS_LABEL[card.rewardRule.cardType ?? "points"] ?? "Points")}
                  </th>
                  <th scope="col" style={TH}>
                    {t("Joined")}
                  </th>
                  <th scope="col" style={{ ...TH, width: "3.5rem" }} aria-label={t("Actions")} />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td
                      style={{
                        ...TD,
                        textAlign: "right",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {progress(card, m.balance)}
                    </td>
                    <td style={{ ...TD, color: "var(--muted)", fontSize: "0.9rem" }}>
                      {m.enrolledAt ? new Date(m.enrolledAt).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      <button
                        className="btn ghost"
                        aria-label={t("View member details")}
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
              borderTop: "1px solid var(--border)",
              fontSize: "0.82rem",
              color: "var(--muted)",
            }}
            aria-live="polite"
          >
            {t("{count} members", { count: members.length })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// ── MembersPage ──────────────────────────────────────────────────────────────────
export function MembersPage() {
  const { t } = useT();
  const [card, setCard] = useState<CardLite | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <AppShell narrow>
        <MemberDetail memberId={selectedId} onBack={() => setSelectedId(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell title={card ? card.name : t("Members")} narrow>
      {card ? (
        <MembersForCard card={card} onBack={() => setCard(null)} onSelect={setSelectedId} />
      ) : (
        <CardPicker onPick={setCard} />
      )}
    </AppShell>
  );
}

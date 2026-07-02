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

function memberTitle(member: Member, fallback: string): string {
  return member.displayName?.trim() || member.email?.trim() || fallback;
}

function memberInitial(member: Member): string {
  const title = memberTitle(member, "Member").trim();
  return title ? (title[0]?.toUpperCase() ?? "M") : "M";
}

function joinedDate(member: Member): string {
  return member.enrolledAt ? new Date(member.enrolledAt).toLocaleDateString() : "-";
}

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
          <div
            aria-label={t("Members of {name}", { name: card.name })}
            style={{
              display: "grid",
              gap: "0.85rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
              padding: "1rem",
            }}
          >
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="glass glass-hover"
                onClick={() => onSelect(m.id)}
                aria-label={t("View member details")}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: "0.8rem",
                  minWidth: 0,
                  width: "100%",
                  padding: "0.95rem",
                  borderRadius: "calc(var(--r-card) - 0.4rem)",
                  color: "var(--text)",
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "2.7rem",
                    height: "2.7rem",
                    borderRadius: "999px",
                    background:
                      "linear-gradient(135deg, rgba(221,246,255,0.9), rgba(246,230,255,0.88))",
                    border: "1px solid rgba(255,255,255,0.75)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
                    color: "var(--text)",
                    fontWeight: 700,
                  }}
                >
                  {memberInitial(m)}
                </span>

                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: 650,
                    }}
                  >
                    {memberTitle(m, t("Member"))}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.55rem",
                      minWidth: 0,
                      marginTop: "0.3rem",
                      color: "var(--muted)",
                      fontSize: "0.82rem",
                    }}
                  >
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {progress(card, m.balance)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t("Joined")} {joinedDate(m)}
                    </span>
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "2.15rem",
                    height: "2.15rem",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.48)",
                    color: "var(--muted)",
                  }}
                >
                  <Icon.Arrow aria-hidden="true" />
                </span>
              </button>
            ))}
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

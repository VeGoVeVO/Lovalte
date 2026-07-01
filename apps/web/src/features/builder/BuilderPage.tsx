import { useLayoutEffect, useRef, useState } from "react";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import { useTemplates, useDeleteTemplate, type CardTemplateDTO } from "./useTemplates";
import { DeleteTemplateModal } from "./DeleteTemplateModal";
import { CardEditor } from "./CardEditor";
import { GoogleWalletEditor } from "./GoogleWalletEditor";
import { IssueCardPanel } from "../wallet/IssueCardPanel";

type EditTarget = CardTemplateDTO | "new" | null;

/**
 * Shows the full card name on one line, shrinking the font to fit its column.
 * If it can't fit even at the floor size, it wraps — so the whole name is always
 * visible (never truncated). Cards are fixed-width, so a one-shot fit is enough.
 */
function FitText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const MAX = 1.3;
  const MIN = 0.95;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = MAX;
    el.style.whiteSpace = "nowrap";
    el.style.fontSize = `${size}rem`;
    let guard = 40;
    while (el.scrollWidth > el.clientWidth && size > MIN && guard-- > 0) {
      size -= 0.04;
      el.style.fontSize = `${size}rem`;
    }
    el.style.whiteSpace = el.scrollWidth > el.clientWidth ? "normal" : "nowrap";
  }, [text]);
  return (
    <span ref={ref} style={{ display: "block", fontSize: `${MAX}rem`, lineHeight: 1.15 }}>
      {text}
    </span>
  );
}

/**
 * Card Builder. The list of card designs + the canvas builder (CardEditor) for
 * creating/editing one. The editor flow is: pick a type, swipe a template, then
 * edit the card directly - every change runs a tool so a future AI can drive it.
 */
export function BuilderPage() {
  const { t } = useT();
  const [editing, setEditing] = useState<EditTarget>(null);
  const [confirmCard, setConfirmCard] = useState<CardTemplateDTO | null>(null);
  const [issueCard, setIssueCard] = useState<CardTemplateDTO | null>(null);

  const templates = useTemplates();
  const deleteMut = useDeleteTemplate();

  if (editing === "new") {
    return (
      <AppShell>
        <CardEditor initial="new" onClose={() => setEditing(null)} />
      </AppShell>
    );
  }
  if (editing && typeof editing !== "string") {
    if (editing.walletPlatform === "google") {
      return (
        <AppShell>
          <GoogleWalletEditor initial={editing} onClose={() => setEditing(null)} />
        </AppShell>
      );
    }
    return (
      <AppShell>
        <CardEditor initial={editing} onClose={() => setEditing(null)} />
      </AppShell>
    );
  }

  const list = templates.data ?? [];
  return (
    <AppShell
      title={t("Card Builder")}
      titleAction={
        <GlassButton type="button" onClick={() => setEditing("new")}>
          {t("+ New card")}
        </GlassButton>
      }
    >
      {templates.isLoading && (
        <p className="body" aria-live="polite">
          {t("Loading templates…")}
        </p>
      )}
      {templates.isError && (
        <GlassCard className="feature">
          <p className="body" role="alert">
            {t("Could not load templates. Please refresh.")}
          </p>
        </GlassCard>
      )}
      {!templates.isLoading && !templates.isError && list.length === 0 && (
        <GlassCard className="feature">
          <p className="body">{t("No templates yet - create your first loyalty card.")}</p>
        </GlassCard>
      )}

      {list.length > 0 && (
        <div
          className="grid-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, 260px)", justifyContent: "center" }}
        >
          {list.map((card) => (
            <GlassCard
              key={card.id}
              hover
              light
              className="feature"
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              aria-label={t("Edit template: {name}", { name: card.name })}
              onClick={() => setEditing(card)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") setEditing(card);
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                }}
              >
                <h2 className="cardt" style={{ margin: 0, flex: 1, minWidth: 0 }}>
                  <FitText text={card.name} />
                </h2>
                <button
                  type="button"
                  aria-label={t("Delete template: {name}", { name: card.name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmCard(card);
                  }}
                  style={{
                    flexShrink: 0,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0.3rem",
                    borderRadius: "0.35rem",
                    color: "var(--muted)",
                    lineHeight: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#b93333")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
              <div style={{ marginTop: "0.55rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 500,
                    padding: "0.2rem 0.55rem",
                    borderRadius: 999,
                    background:
                      card.status === "published" ? "rgba(0,180,90,.13)" : "rgba(200,160,0,.11)",
                    border: `1px solid ${card.status === "published" ? "rgba(0,180,90,.3)" : "rgba(200,160,0,.26)"}`,
                    color: card.status === "published" ? "rgb(0,150,70)" : "rgb(150,110,0)",
                  }}
                >
                  {t(card.status)}
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 500,
                    padding: "0.2rem 0.55rem",
                    borderRadius: 999,
                    background:
                      card.walletPlatform === "google"
                        ? "rgba(66,133,244,.12)"
                        : card.googleOverrides
                        ? "rgba(66,133,244,.08)"
                        : "rgba(0,0,0,.07)",
                    border: `1px solid ${
                      card.walletPlatform === "google"
                        ? "rgba(66,133,244,.3)"
                        : card.googleOverrides
                        ? "rgba(66,133,244,.22)"
                        : "rgba(0,0,0,.14)"
                    }`,
                    color:
                      card.walletPlatform === "google"
                        ? "rgb(30,80,200)"
                        : card.googleOverrides
                        ? "rgb(50,90,180)"
                        : "var(--muted)",
                  }}
                >
                  {card.walletPlatform === "google" ? "Google" : card.googleOverrides ? "Both" : "Apple"}
                </span>
              </div>
              <p className="body" style={{ margin: "0.6rem 0 0", fontSize: "0.82rem" }}>
                v{card.version} · {new Date(card.updatedAt).toLocaleDateString()}
              </p>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".85rem" }}>
                <button
                  type="button"
                  className="btn"
                  disabled={card.status !== "published"}
                  aria-label={t("Issue {name}", { name: card.name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIssueCard(card);
                  }}
                  style={{
                    minHeight: 38,
                    padding: ".45rem .8rem",
                    fontSize: ".84rem",
                  }}
                >
                  {t("Issue")}
                </button>
                {card.status !== "published" ? (
                  <span className="body" style={{ margin: 0, alignSelf: "center", fontSize: ".76rem" }}>
                    {t("Publish first")}
                  </span>
                ) : null}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {issueCard ? (
        <div style={{ maxWidth: 680, margin: "1.25rem auto 0" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ".55rem" }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setIssueCard(null)}
              style={{ padding: ".45rem .7rem", fontSize: ".86rem" }}
            >
              {t("Close")}
            </button>
          </div>
          <IssueCardPanel templateId={issueCard.id} cardName={issueCard.name} />
        </div>
      ) : null}

      {confirmCard && (
        <DeleteTemplateModal
          card={confirmCard}
          busy={deleteMut.isPending}
          onCancel={() => setConfirmCard(null)}
          onConfirm={async () => {
            await deleteMut.mutateAsync(confirmCard.id);
            setConfirmCard(null);
          }}
        />
      )}
    </AppShell>
  );
}

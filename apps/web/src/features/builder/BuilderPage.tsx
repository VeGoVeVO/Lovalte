import { useLayoutEffect, useRef, useState } from "react";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import { useTemplates, useDeleteTemplate, type CardTemplateDTO } from "./useTemplates";
import { DeleteTemplateModal } from "./DeleteTemplateModal";
import { CardEditor } from "./CardEditor";

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

  const templates = useTemplates();
  const deleteMut = useDeleteTemplate();

  if (editing) {
    return (
      <AppShell>
        <CardEditor initial={editing} onClose={() => setEditing(null)} />
      </AppShell>
    );
  }

  const list = templates.data ?? [];
  return (
    <AppShell>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ flex: 1 }} aria-hidden="true" />
        <h1
          className="cardt"
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: "clamp(1.1rem,1rem + 0.5vw,1.3rem)",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {t("Card Builder")}
        </h1>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <GlassButton type="button" onClick={() => setEditing("new")}>
            {t("+ New card")}
          </GlassButton>
        </div>
      </div>

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
          style={{ gridTemplateColumns: "repeat(auto-fill, 260px)", justifyContent: "center" }}
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
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
                  <h2 className="cardt" style={{ margin: 0, flex: 1, minWidth: 0 }}>
                    <FitText text={card.name} />
                  </h2>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 500,
                      padding: "0.2rem 0.55rem",
                      borderRadius: 999,
                      flexShrink: 0,
                      background:
                        card.status === "published" ? "rgba(0,180,90,.13)" : "rgba(200,160,0,.11)",
                      border: `1px solid ${card.status === "published" ? "rgba(0,180,90,.3)" : "rgba(200,160,0,.26)"}`,
                      color: card.status === "published" ? "rgb(0,150,70)" : "rgb(150,110,0)",
                    }}
                  >
                    {t(card.status)}
                  </span>
                </div>
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
              <p className="body" style={{ margin: "0.6rem 0 0", fontSize: "0.82rem" }}>
                v{card.version} · {new Date(card.updatedAt).toLocaleDateString()}
              </p>
            </GlassCard>
          ))}
        </div>
      )}

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

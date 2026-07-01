import { useState } from "react";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import { useTemplates, useDeleteTemplate, type CardTemplateDTO } from "./useTemplates";
import { DeleteTemplateModal } from "./DeleteTemplateModal";
import { CardEditor } from "./CardEditor";
import { GoogleWalletEditor } from "./GoogleWalletEditor";
import { IssueCardPanel } from "../wallet/IssueCardPanel";
import { CardCanvas } from "./CardCanvas";
import { GoogleCardCanvas } from "./GoogleCardCanvas";
import { docFromTemplate } from "./cardDoc";

type EditTarget = CardTemplateDTO | "new" | null;

const builderListCss = `
.lvt-card-rail {
  display:flex;
  gap:1rem;
  overflow-x:auto;
  scroll-snap-type:x mandatory;
  scroll-padding-inline:clamp(.85rem, 4vw, 2rem);
  padding:.25rem clamp(.85rem, 4vw, 2rem) 1rem;
  margin-inline:calc(clamp(.85rem, 4vw, 2rem) * -1);
  -webkit-overflow-scrolling:touch;
}
.lvt-card-rail::-webkit-scrollbar { height:0; }
.lvt-card-slide {
  flex:0 0 min(88vw, 420px);
  scroll-snap-align:center;
  padding:1rem;
  gap:.9rem;
  min-height:660px;
}
.lvt-card-slide-head { display:flex; align-items:flex-start; justify-content:space-between; gap:.75rem; }
.lvt-card-slide-title { min-width:0; display:flex; flex-direction:column; gap:.25rem; }
.lvt-card-slide-title h2 { margin:0; font-size:clamp(1.05rem, 3.5vw, 1.35rem); line-height:1.12; font-weight:650; }
.lvt-card-slide-title span { color:var(--muted); font-size:.82rem; }
.lvt-card-stage {
  min-height:390px;
  display:grid;
  place-items:center;
  border-radius:22px;
  padding:1rem .4rem;
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(169,245,255,.14), transparent 55%),
    radial-gradient(120% 90% at 100% 100%, rgba(229,216,255,.16), transparent 58%),
    rgba(255,255,255,.22);
  overflow:hidden;
}
.lvt-card-preview-button {
  border:0;
  padding:0;
  background:transparent;
  cursor:pointer;
  display:grid;
  place-items:center;
  width:100%;
  -webkit-tap-highlight-color:transparent;
}
.lvt-card-preview-button:focus-visible { outline:3px solid rgba(169,245,255,.55); outline-offset:6px; border-radius:24px; }
.lvt-card-info { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.55rem; }
.lvt-card-info-item { padding:.7rem .75rem; border-radius:16px; background:rgba(255,255,255,.36); border:1px solid rgba(255,255,255,.62); }
.lvt-card-info-item strong { display:block; font-size:.78rem; color:var(--muted); font-weight:600; margin-bottom:.18rem; }
.lvt-card-info-item span { display:block; font-size:.9rem; color:var(--text); font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.lvt-card-actions { display:flex; gap:.55rem; flex-wrap:wrap; justify-content:space-between; }
.lvt-card-actions .btn { min-height:38px; padding:.48rem .75rem; font-size:.84rem; }
.lvt-card-stage .lvt-issue-panel { width:100%; }
.lvt-card-stage .lvt-issue-panel .btn { min-height:34px; padding:.38rem .58rem; font-size:.78rem; }
@media (max-width: 520px) {
  .lvt-card-slide { flex-basis:88vw; min-height:560px; padding:.85rem; }
  .lvt-card-stage { min-height:360px; }
  .lvt-card-info-item { padding:.58rem .5rem; }
  .lvt-card-info-item strong { font-size:.7rem; }
  .lvt-card-info-item span { font-size:.82rem; }
}
@media (prefers-reduced-motion: no-preference) {
  .lvt-card-slide { transition:transform var(--d) var(--ease), box-shadow var(--d) var(--ease); }
  .lvt-card-preview-button > * { transition:transform var(--d) var(--ease); }
  .lvt-card-preview-button:hover > * { transform:translateY(-2px); }
}
`;

function CardPreview({ card }: { card: CardTemplateDTO }) {
  const doc = docFromTemplate(card);
  if (card.walletPlatform === "google") {
    return <GoogleCardCanvas doc={doc} readOnly width={280} />;
  }
  return <CardCanvas doc={doc} readOnly width={280} />;
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
  const [issueCardId, setIssueCardId] = useState<string | null>(null);

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
      <style>{builderListCss}</style>
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
        <div className="lvt-card-rail" aria-label={t("Saved cards")}>
          {list.map((card) => (
            <GlassCard
              key={card.id}
              light
              className="feature lvt-card-slide"
              aria-label={t("Saved card: {name}", { name: card.name })}
            >
              <div className="lvt-card-slide-head">
                <div className="lvt-card-slide-title">
                  <h2>{card.name}</h2>
                  <span>
                    {card.walletPlatform === "google"
                      ? "Google Wallet"
                      : card.googleOverrides
                        ? "Apple + Google Wallet"
                        : "Apple Wallet"}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={card.status !== "published"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIssueCardId(issueCardId === card.id ? null : card.id);
                  }}
                  style={{
                    flexShrink: 0,
                    minHeight: 38,
                    padding: ".48rem .85rem",
                    fontSize: ".86rem",
                  }}
                >
                  {issueCardId === card.id ? t("Card") : t("Issue")}
                </button>
              </div>

              <div className="lvt-card-stage">
                {issueCardId === card.id ? (
                  <IssueCardPanel templateId={card.id} cardName={card.name} autoCreateQr compact />
                ) : (
                  <button
                    type="button"
                    className="lvt-card-preview-button"
                    onClick={() => setEditing(card)}
                    aria-label={t("Edit template: {name}", { name: card.name })}
                  >
                    <CardPreview card={card} />
                  </button>
                )}
              </div>

              <div className="lvt-card-info">
                <div className="lvt-card-info-item">
                  <strong>{t("Status")}</strong>
                  <span>{t(card.status)}</span>
                </div>
                <div className="lvt-card-info-item">
                  <strong>{t("Issued")}</strong>
                  <span>{card.issuedCount}</span>
                </div>
                <div className="lvt-card-info-item">
                  <strong>{t("Updated")}</strong>
                  <span>{new Date(card.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="lvt-card-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setEditing(card)}
                  aria-label={t("Edit template: {name}", { name: card.name })}
                >
                  {t("Edit")}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setConfirmCard(card)}
                  aria-label={t("Delete template: {name}", { name: card.name })}
                >
                  {t("Delete")}
                </button>
                <span
                  className="body"
                  style={{ margin: 0, alignSelf: "center", fontSize: ".78rem" }}
                >
                  {card.status !== "published" ? t("Publish first") : `v${card.version}`}
                </span>
              </div>
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

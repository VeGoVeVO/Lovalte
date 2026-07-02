import { useLayoutEffect, useRef, useState } from "react";
import { DynamicIcon } from "lucide-react/dynamic";
import { AppShell } from "../../lib/AppShell";
import { GlassCard } from "../../design-system/halo";
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
.lvt-builder-page {
  height:auto;
  min-height:0;
  display:flex;
  flex-direction:column;
  overflow:hidden;
}
@media (max-width: 767px) {
  .lvt-pageview:has(.lvt-builder-page) {
    height:calc(100dvh - 58px - 1rem - 58px - env(safe-area-inset-bottom, 0px) - .85rem - env(safe-area-inset-top, 0px));
    min-height:0;
    display:flex;
    flex-direction:column;
    overflow:hidden;
  }
  .lvt-main:has(.lvt-builder-page) { padding-bottom:calc(58px + env(safe-area-inset-bottom, 0px)) !important; }
  .lvt-pageview:has(.lvt-builder-page) .lvt-titlebar { flex:0 0 auto; }
  .lvt-builder-page { flex:1 1 auto; }
}
.lvt-card-rail {
  display:flex;
  align-items:stretch;
  gap:.85rem;
  overflow-x:auto;
  overflow-y:hidden;
  scroll-snap-type:x mandatory;
  scroll-padding-inline:clamp(.85rem, 4vw, 2rem);
  padding:.08rem clamp(.85rem, 4vw, 2rem) .2rem;
  margin-inline:calc(clamp(.85rem, 4vw, 2rem) * -1);
  -webkit-overflow-scrolling:touch;
  scrollbar-width:none;
  -ms-overflow-style:none;
  flex:1 1 auto;
  min-height:0;
}
.lvt-card-rail::-webkit-scrollbar { height:0; }
.halo .lvt-card-slide {
  flex:0 0 min(90vw, 424px);
  scroll-snap-align:center;
  padding:clamp(.52rem, 2vw, .82rem);
  gap:clamp(.34rem, 1.4vw, .58rem);
  height:100%;
  max-height:100%;
  min-height:0;
  display:grid;
  grid-template-rows:auto minmax(0, 1fr) auto;
  overflow:hidden;
}
.lvt-card-slide-head { display:flex; align-items:center; justify-content:space-between; gap:.55rem; min-height:2.3rem; }
.lvt-card-slide-title { min-width:0; display:flex; flex-direction:column; gap:.12rem; }
.lvt-card-slide-title h2 { margin:0; font-size:clamp(.96rem, 3vw, 1.12rem); line-height:1.05; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.lvt-card-slide-title span { color:var(--muted); font-size:.7rem; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.lvt-card-top-actions { display:flex; align-items:center; gap:.38rem; flex-shrink:0; }
.lvt-card-iconbtn {
  width:2.08rem;
  height:2.08rem;
  border-radius:13px;
  border:1px solid rgba(255,255,255,.68);
  background:
    linear-gradient(135deg, rgba(255,255,255,.72), rgba(255,255,255,.32)),
    radial-gradient(95% 100% at 8% 0%, rgba(169,245,255,.30), transparent 60%),
    radial-gradient(95% 100% at 100% 100%, rgba(255,221,244,.28), transparent 60%);
  color:var(--text);
  display:grid;
  place-items:center;
  cursor:pointer;
  box-shadow:0 1px 0 rgba(255,255,255,.82) inset, 0 10px 24px -20px rgba(46,62,92,.45);
  transition:transform var(--d-fast) var(--ease), box-shadow var(--d-fast) var(--ease), opacity var(--d-fast) var(--ease);
}
.lvt-card-iconbtn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:var(--shadow-soft); }
.lvt-card-iconbtn:active:not(:disabled) { transform:scale(.96); }
.lvt-card-iconbtn:focus-visible { outline:3px solid rgba(169,245,255,.42); outline-offset:2px; }
.lvt-card-iconbtn:disabled { opacity:.38; cursor:not-allowed; }
.lvt-card-iconbtn[data-active="true"] { color:#315f76; border-color:rgba(169,245,255,.78); }
.lvt-card-stage {
  align-self:stretch;
  min-height:0;
  display:block;
  border-radius:22px;
  padding:0;
  background:transparent;
  overflow:hidden;
  perspective:1100px;
}
.lvt-card-flip {
  position:relative;
  width:100%;
  height:100%;
  transform-style:preserve-3d;
}
.lvt-card-face {
  position:absolute;
  inset:0;
  display:grid;
  place-items:center;
  backface-visibility:hidden;
  overflow:hidden;
  border-radius:22px;
}
.lvt-card-face.back {
  transform:rotateY(180deg);
  padding:.6rem;
  background:
    linear-gradient(135deg, rgba(255,255,255,.56), rgba(255,255,255,.22)),
    radial-gradient(120% 100% at 0% 0%, rgba(169,245,255,.18), transparent 58%),
    radial-gradient(120% 100% at 100% 100%, rgba(255,221,244,.18), transparent 58%);
}
.lvt-card-stage.is-issue .lvt-card-flip { transform:rotateY(180deg); }
.lvt-card-preview-button {
  border:0;
  padding:0;
  background:transparent;
  cursor:pointer;
  display:grid;
  place-items:center;
  width:100%;
  height:100%;
  color:inherit;
  font:inherit;
  text-align:initial;
  -webkit-tap-highlight-color:transparent;
}
.lvt-card-preview-button:focus-visible { outline:3px solid rgba(169,245,255,.55); outline-offset:-3px; border-radius:24px; }
.lvt-card-preview-fit {
  width:100%;
  height:100%;
  display:grid;
  place-items:center;
  overflow:visible;
}
.lvt-card-preview-fit-inner {
  flex:none;
  max-width:100%;
}
.lvt-card-preview-fit-inner > * { max-width:100%; }
.lvt-card-info { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.3rem; flex-shrink:0; }
.lvt-card-info-item { min-width:0; padding:.12rem .18rem 0; }
.lvt-card-info-item strong { display:block; font-size:.62rem; line-height:1.05; color:var(--muted); font-weight:700; margin-bottom:.12rem; }
.lvt-card-info-item span { display:block; font-size:.75rem; line-height:1.08; color:var(--text); font-weight:750; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.lvt-card-stage .lvt-issue-panel { width:100%; max-width:300px; }
.lvt-card-stage .lvt-issue-panel .btn { min-height:34px; padding:.38rem .58rem; font-size:.78rem; }
.lvt-add-card {
  width:3rem;
  height:3rem;
  border-radius:18px;
  display:grid;
  place-items:center;
  padding:0;
}
.lvt-add-card svg { filter:drop-shadow(0 8px 14px rgba(83,114,150,.22)); }
@media (max-width: 520px) {
  .lvt-builder-page { height:auto; min-height:0; }
  .lvt-card-rail { padding-bottom:.16rem; }
  .halo .lvt-card-slide { flex-basis:90vw; padding:.56rem; gap:.34rem; }
  .lvt-card-info-item strong { font-size:.6rem; }
  .lvt-card-info-item span { font-size:.72rem; }
  .lvt-card-iconbtn { width:1.98rem; height:1.98rem; border-radius:12px; }
}
@media (prefers-reduced-motion: no-preference) {
  .lvt-card-slide { transition:transform var(--d) var(--ease), box-shadow var(--d) var(--ease); }
  .lvt-card-flip { transition:transform .62s cubic-bezier(.22,1,.36,1); }
  .lvt-card-preview-button > * { transition:transform var(--d) var(--ease); }
  .lvt-card-preview-button:hover > * { transform:translateY(-2px); }
}
@media (prefers-reduced-motion: reduce) {
  .lvt-card-flip, .lvt-card-slide, .lvt-card-preview-button > * { transition:none !important; }
}
`;

function CardPreview({ card }: { card: CardTemplateDTO }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const naturalWidth = 340;
  const [canvasWidth, setCanvasWidth] = useState(300);
  const doc = docFromTemplate(card);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box) return;

    const fit = () => {
      const measuredRatio =
        inner && canvasWidth > 0 && inner.offsetHeight > 0
          ? inner.offsetHeight / canvasWidth
          : card.walletPlatform === "google"
            ? 1.62
            : 1.48;
      const next = Math.floor(
        Math.min(naturalWidth, box.clientWidth - 2, box.clientHeight / measuredRatio),
      );
      if (Number.isFinite(next)) {
        setCanvasWidth((current) => {
          const fitted = Math.max(180, next);
          return Math.abs(current - fitted) > 1 ? fitted : current;
        });
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [canvasWidth, card.id, card.walletPlatform]);

  return (
    <div className="lvt-card-preview-fit" ref={boxRef}>
      <div className="lvt-card-preview-fit-inner" ref={innerRef}>
        {card.walletPlatform === "google" ? (
          <GoogleCardCanvas doc={doc} readOnly width={canvasWidth} />
        ) : (
          <CardCanvas doc={doc} readOnly width={canvasWidth} />
        )}
      </div>
    </div>
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
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="btn lvt-add-card"
          aria-label={t("New card")}
        >
          <DynamicIcon name={"badge-plus" as never} size={21} aria-hidden="true" />
        </button>
      }
    >
      <style>{builderListCss}</style>
      <div className="lvt-builder-page">
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
                className="lvt-card-slide"
                aria-label={t("Saved card: {name}", { name: card.name })}
              >
                <div className="lvt-card-slide-head">
                  <div className="lvt-card-slide-title">
                    <h2>{card.name}</h2>
                    <span>
                      {card.walletPlatform === "google"
                        ? `Google Wallet · v${card.version}`
                        : card.googleOverrides
                          ? `Apple + Google Wallet · v${card.version}`
                          : `Apple Wallet · v${card.version}`}
                    </span>
                  </div>
                  <div className="lvt-card-top-actions">
                    <button
                      type="button"
                      className="lvt-card-iconbtn"
                      onClick={() => setEditing(card)}
                      aria-label={t("Edit template: {name}", { name: card.name })}
                    >
                      <DynamicIcon name={"pencil" as never} size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="lvt-card-iconbtn"
                      disabled={card.status !== "published"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIssueCardId(issueCardId === card.id ? null : card.id);
                      }}
                      data-active={issueCardId === card.id}
                      aria-label={issueCardId === card.id ? t("Show card") : t("Issue card")}
                    >
                      <DynamicIcon
                        name={(issueCardId === card.id ? "credit-card" : "qr-code") as never}
                        size={16}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      className="lvt-card-iconbtn"
                      onClick={() => setConfirmCard(card)}
                      aria-label={t("Delete template: {name}", { name: card.name })}
                    >
                      <DynamicIcon name={"trash-2" as never} size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className={`lvt-card-stage${issueCardId === card.id ? " is-issue" : ""}`}>
                  <div className="lvt-card-flip">
                    <div className="lvt-card-face front">
                      <button
                        type="button"
                        className="lvt-card-preview-button"
                        onClick={() => setEditing(card)}
                        aria-label={t("Edit template: {name}", { name: card.name })}
                      >
                        <CardPreview card={card} />
                      </button>
                    </div>
                    <div className="lvt-card-face back">
                      <IssueCardPanel
                        templateId={card.id}
                        cardName={card.name}
                        autoCreateQr
                        compact
                      />
                    </div>
                  </div>
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
              </GlassCard>
            ))}
          </div>
        )}
      </div>

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

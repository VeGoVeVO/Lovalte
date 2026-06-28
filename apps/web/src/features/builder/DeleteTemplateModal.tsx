import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../lib/i18n";
import type { CardTemplateDTO } from "./useTemplates";

interface Props {
  card: CardTemplateDTO;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const modalCss = `
.lvt-del-overlay {
  position: fixed; inset: 0; z-index: 2000;
  display: flex; align-items: center; justify-content: center;
  padding: clamp(1rem, 4vw, 2rem);
  background: rgba(18, 20, 32, 0.42);
  -webkit-backdrop-filter: blur(10px) saturate(120%);
  backdrop-filter: blur(10px) saturate(120%);
  animation: lvtDelFade .18s ease-out both;
}
.lvt-del-panel {
  position: relative; overflow: hidden;
  width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 1rem;
  padding: clamp(1.3rem, 4vw, 1.8rem);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255,255,255,.86), rgba(255,255,255,.72));
  -webkit-backdrop-filter: blur(30px) saturate(185%);
  backdrop-filter: blur(30px) saturate(185%);
  border: 1px solid rgba(255,255,255,.7);
  box-shadow: 0 30px 80px -24px rgba(16,18,27,.55), 0 1px 0 rgba(255,255,255,.7) inset;
  animation: lvtDelRise .26s cubic-bezier(.22,.61,.36,1) both;
}
/* Ambient orbs (website background) bleeding through the frost. */
.lvt-del-panel::before, .lvt-del-panel::after {
  content: ""; position: absolute; border-radius: 50%; filter: blur(48px);
  pointer-events: none; z-index: 0;
}
.lvt-del-panel::before { top: -40%; left: -25%; width: 70%; height: 70%; background: #A9F5FF; opacity: .34; }
.lvt-del-panel::after  { bottom: -45%; right: -25%; width: 75%; height: 75%; background: #FFDDF4; opacity: .42; }
.lvt-del-panel > * { position: relative; z-index: 1; }
.lvt-del-title { margin: 0; display: flex; align-items: center; gap: .6rem; }
.lvt-del-mark {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center; color: #b93333;
  background: rgba(185,51,51,.12); border: 1px solid rgba(185,51,51,.28);
}
.lvt-del-actions { display: flex; gap: .75rem; justify-content: flex-end; flex-wrap: wrap; margin-top: .25rem; }
.lvt-del-danger {
  padding: .6rem 1.15rem; border-radius: .7rem; font-weight: 600; cursor: pointer;
  color: #fff; background: linear-gradient(180deg, #d24a4a, #b93333);
  border: 1px solid rgba(150,30,30,.55);
  box-shadow: 0 8px 20px -10px rgba(185,51,51,.7);
}
.lvt-del-danger:disabled { opacity: .6; cursor: default; }
@keyframes lvtDelFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes lvtDelRise { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .lvt-del-overlay, .lvt-del-panel { animation: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .lvt-del-overlay { background: rgba(18,20,32,.6) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  .lvt-del-panel { background: #fff !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
}
`;

/**
 * Confirm-delete dialog for a card design. Rendered in a portal so the fixed
 * overlay escapes the app shell's transformed ancestors and covers the whole
 * viewport (incl. the nav) on every screen size. Copy adapts to how many passes
 * are live: a clean permanent-delete when none exist, or an honest warning that
 * customers' Wallet cards will be deactivated when they do.
 */
export function DeleteTemplateModal({ card, busy, onCancel, onConfirm }: Props) {
  const { t } = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock background scroll
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      // Minimal focus trap: keep Tab within the dialog.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onCancel]);

  const n = card.issuedCount;
  const liveLine =
    n === 1
      ? t("1 customer already has this card in their Apple Wallet.")
      : t("{count} customers already have this card in their Apple Wallet.", { count: n });

  return createPortal(
    <div className="lvt-del-overlay" onClick={() => !busy && onCancel()}>
      <style>{modalCss}</style>
      <div
        ref={panelRef}
        className="lvt-del-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-title"
        aria-describedby="del-body"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h2 id="del-title" className="cardt lvt-del-title">
          <span className="lvt-del-mark" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </span>
          {t("Delete “{name}”?", { name: card.name })}
        </h2>

        <div id="del-body" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {n === 0 ? (
            <p className="body" style={{ margin: 0 }}>
              {t(
                "Nothing has been issued from this design yet, so it will be permanently deleted. This can't be undone.",
              )}
            </p>
          ) : (
            <>
              <p className="body" style={{ margin: 0, fontWeight: 500 }}>
                {liveLine}
              </p>
              <p className="body" style={{ margin: 0 }}>
                {t(
                  "Deleting deactivates those cards: each one updates in the customer's Apple Wallet to a deprecated Lovalte card telling them it no longer works and to remove it, and it stops earning points. This can't be undone.",
                )}
              </p>
            </>
          )}
        </div>

        <div className="lvt-del-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="lvt-del-danger"
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy ? t("Deleting…") : t("Delete card")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

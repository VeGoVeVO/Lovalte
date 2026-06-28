import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  /** Called on backdrop click, Esc, or a Cancel control. Ignored while busy. */
  onClose: () => void;
  /** When true, the dialog can't be dismissed (an action is in flight). */
  busy?: boolean;
  /** id of the element labelling the dialog (usually the title). */
  labelledBy?: string;
  /** id of the element describing the dialog (usually the body). */
  describedBy?: string;
  maxWidth?: number;
  children: ReactNode;
}

const STYLE_ID = "lvt-modal-style";
// THE popup baseline for the whole app (extracted from the delete-card dialog).
// Reuse <Modal> for every popup so they all share this frosted, ambient look,
// focus trap, scroll-lock and reduced-motion / reduced-transparency fallbacks.
const CSS = `
.lvt-modal-overlay {
  position: fixed; inset: 0; z-index: 2000;
  display: flex; align-items: center; justify-content: center;
  padding: clamp(1rem, 4vw, 2rem);
  background: rgba(18, 20, 32, 0.42);
  -webkit-backdrop-filter: blur(10px) saturate(120%);
  backdrop-filter: blur(10px) saturate(120%);
  animation: lvtModalFade .18s ease-out both;
}
.lvt-modal-panel {
  position: relative; overflow: hidden;
  width: 100%; max-height: 90vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 1rem;
  padding: clamp(1.3rem, 4vw, 1.8rem);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255,255,255,.86), rgba(255,255,255,.72));
  -webkit-backdrop-filter: blur(30px) saturate(185%);
  backdrop-filter: blur(30px) saturate(185%);
  border: 1px solid rgba(255,255,255,.7);
  box-shadow: 0 30px 80px -24px rgba(16,18,27,.55), 0 1px 0 rgba(255,255,255,.7) inset;
  animation: lvtModalRise .26s cubic-bezier(.22,.61,.36,1) both;
}
.lvt-modal-panel::before, .lvt-modal-panel::after {
  content: ""; position: absolute; border-radius: 50%; filter: blur(48px); pointer-events: none; z-index: 0;
}
.lvt-modal-panel::before { top: -40%; left: -25%; width: 70%; height: 70%; background: #A9F5FF; opacity: .34; }
.lvt-modal-panel::after  { bottom: -45%; right: -25%; width: 75%; height: 75%; background: #FFDDF4; opacity: .42; }
.lvt-modal-panel > * { position: relative; z-index: 1; }
.lvt-modal-title { margin: 0; display: flex; align-items: center; gap: .6rem; }
.lvt-modal-mark { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; }
.lvt-modal-mark.danger { color: #b93333; background: rgba(185,51,51,.12); border: 1px solid rgba(185,51,51,.28); }
.lvt-modal-mark.brand  { color: #2f6fe0; background: rgba(58,134,255,.12); border: 1px solid rgba(58,134,255,.28); }
.lvt-modal-actions { display: flex; gap: .75rem; justify-content: flex-end; flex-wrap: wrap; margin-top: .25rem; }
.lvt-modal-danger { padding: .6rem 1.15rem; border-radius: .7rem; font-weight: 600; cursor: pointer; color: #fff;
  background: linear-gradient(180deg, #d24a4a, #b93333); border: 1px solid rgba(150,30,30,.55); box-shadow: 0 8px 20px -10px rgba(185,51,51,.7); }
.lvt-modal-danger:disabled { opacity: .6; cursor: default; }
@keyframes lvtModalFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes lvtModalRise { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .lvt-modal-overlay, .lvt-modal-panel { animation: none !important; } }
@media (prefers-reduced-transparency: reduce) {
  .lvt-modal-overlay { background: rgba(18,20,32,.6) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  .lvt-modal-panel { background: #fff !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
}
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * The app's baseline popup. Renders in a portal so the fixed overlay escapes any
 * transformed/blurred ancestor and covers the whole viewport on every screen.
 * Pass your content as children; use `.lvt-modal-title`, `.lvt-modal-mark`,
 * `.lvt-modal-actions`, `.lvt-modal-danger` for a consistent look.
 */
export function Modal({
  onClose,
  busy = false,
  labelledBy,
  describedBy,
  maxWidth = 460,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  ensureStyle();

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>("button:not([disabled]), [href], input, select, textarea")
      ?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock background scroll
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
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
  }, [busy, onClose]);

  return createPortal(
    <div className="lvt-modal-overlay" onClick={() => !busy && onClose()}>
      <div
        ref={panelRef}
        className="lvt-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

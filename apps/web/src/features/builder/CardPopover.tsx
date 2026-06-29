import { useRef, type ReactNode } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  arrow,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from "@floating-ui/react";

const STYLE_ID = "lvt-pop-style";
// PowerPoint-style contextual editor: a popover anchored NEXT TO the clicked card
// element. Floating UI handles flip/shift/size so it stays on-screen on every
// viewport; on a phone it clamps to the width and slides above/below the element.
const CSS = `
.lvt-pop {
  z-index: 2200; width: max-content; max-width: min(320px, calc(100vw - 20px));
  border-radius: 16px; padding: 14px;
  background: var(--card, linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9)));
  -webkit-backdrop-filter: blur(22px) saturate(180%); backdrop-filter: blur(22px) saturate(180%);
  border: 1px solid var(--border, rgba(20,24,40,.1));
  box-shadow: 0 1px 2px rgba(16,18,27,.06), 0 14px 38px -10px rgba(16,18,27,.45);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  color: var(--text, #1c2030);
  animation: lvtPopIn .16s cubic-bezier(.22,.61,.36,1) both;
}
.lvt-pop-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.lvt-pop-title { font-size:.7rem; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:var(--muted, #5b6170); margin:0; }
.lvt-pop-x { flex:0 0 auto; width:24px; height:24px; border:0; border-radius:7px; cursor:pointer; line-height:0;
  color:var(--muted, #5b6170); background:rgba(20,24,40,.06); display:grid; place-items:center; transition:background .15s ease, color .15s ease; }
.lvt-pop-x:hover { background:rgba(20,24,40,.12); color:var(--text, #1c2030); }
.lvt-pop-arrow { position:absolute; width:10px; height:10px; rotate:45deg;
  background:var(--card, rgba(255,255,255,.95)); border:1px solid var(--border, rgba(20,24,40,.1)); }
@keyframes lvtPopIn { from { opacity:0; transform:translateY(6px) scale(.97) } to { opacity:1; transform:none } }
@media (prefers-reduced-motion:reduce){ .lvt-pop { animation:none } }
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Anchored, dismissible editing popover for one card component. */
export function CardPopover({ anchor, open, onClose, title, children }: Props) {
  ensureStyle();
  const arrowRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles, context, middlewareData, placement } = useFloating({
    open,
    onOpenChange: (o) => {
      if (!o) onClose();
    },
    placement: "right-start",
    // fixed strategy + reactive `elements.reference` = positions correctly from
    // the clicked card element's viewport rect (no race, survives scroll/portal).
    strategy: "fixed",
    elements: { reference: anchor },
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(12),
      flip({ fallbackPlacements: ["left-start", "bottom-start", "top-start"], padding: 10 }),
      shift({ padding: 10 }),
      size({
        padding: 10,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(200, availableHeight)}px`;
          elements.floating.style.overflowY = "auto";
        },
      }),
      arrow({ element: arrowRef, padding: 12 }),
    ],
  });

  // Don't close when the click lands in a child popup that portals to <body>
  // (the colour picker wheel, the icon-picker modal) — those are still "inside".
  const dismiss = useDismiss(context, {
    outsidePress: (e) =>
      !(e.target as Element | null)?.closest?.(".lvt-cp-pop, .lvt-modal-overlay"),
  });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  if (!open || !anchor) return null;

  const side = placement.split("-")[0] ?? "right";
  const arrowX = middlewareData.arrow?.x;
  const arrowY = middlewareData.arrow?.y;
  const staticSide =
    ({ top: "bottom", right: "left", bottom: "top", left: "right" } as Record<string, string>)[
      side
    ] ?? "left";

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
        <div
          ref={refs.setFloating}
          className="lvt-pop"
          style={floatingStyles}
          {...getFloatingProps()}
          aria-label={title}
        >
          <div className="lvt-pop-head">
            <p className="lvt-pop-title">{title}</p>
            <button type="button" className="lvt-pop-x" aria-label="Close" onClick={onClose}>
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
          <div
            ref={arrowRef}
            className="lvt-pop-arrow"
            style={{
              left: arrowX != null ? `${arrowX}px` : "",
              top: arrowY != null ? `${arrowY}px` : "",
              [staticSide]: "-5px",
            }}
          />
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

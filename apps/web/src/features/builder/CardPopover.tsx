import { useEffect, useRef, type ReactNode } from "react";
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
  type ReferenceType,
} from "@floating-ui/react";

/** A popover anchor: a real DOM element, or a virtual point (click coords). */
export type PopAnchor = ReferenceType | null;

const STYLE_ID = "lvt-pop-style";
// Contextual editor anchored NEXT TO the clicked card element. It lives in a
// FloatingPortal on <body> — OUTSIDE the `.halo` scope — so it cannot read the
// Halo design tokens. We therefore make it a SELF-CONTAINED frosted-glass surface
// (same material as <Modal>): the panel hardcodes its glass, and re-declares the
// token vars locally so every child (.input/.btn/AssetField/labels) themes itself
// instead of falling back to naked browser styling. Each component gets its own
// accent (`--pa`) so the popovers read as distinct, designed surfaces.
const CSS = `
.lvt-pop {
  --pa: #5BA7C9;
  --text: #20242A; --muted: #5b6170;
  --border: rgba(28,36,56,.12);
  --card: rgba(255,255,255,.58);
  --r-input: 12px;
  z-index: 2200; width: max-content; max-width: min(330px, calc(100vw - 20px));
  border-radius: 18px; padding: 14px 14px 15px;
  color: var(--text);
  background:
    radial-gradient(150% 90% at 0% 0%, color-mix(in srgb, var(--pa) 16%, transparent), transparent 58%),
    linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.78));
  -webkit-backdrop-filter: blur(30px) saturate(185%); backdrop-filter: blur(30px) saturate(185%);
  border: 1px solid rgba(255,255,255,.72);
  box-shadow:
    0 1px 0 rgba(255,255,255,.85) inset,
    0 2px 8px -3px rgba(16,18,40,.14),
    0 26px 60px -22px rgba(16,18,40,.5);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  animation: lvtPopIn .2s cubic-bezier(.22,.61,.36,1) both;
}
.lvt-pop-head { display:flex; align-items:center; gap:11px; margin-bottom:13px; }
.lvt-pop-mark { flex:0 0 auto; width:34px; height:34px; border-radius:11px; display:grid; place-items:center;
  color:var(--pa); background:color-mix(in srgb, var(--pa) 15%, #fff);
  border:1px solid color-mix(in srgb, var(--pa) 34%, transparent);
  box-shadow:0 1px 0 rgba(255,255,255,.85) inset, 0 4px 10px -6px color-mix(in srgb, var(--pa) 60%, transparent); }
.lvt-pop-titles { display:flex; flex-direction:column; min-width:0; flex:1; gap:1px; }
.lvt-pop-title { font-size:.82rem; font-weight:700; letter-spacing:-.01em; color:var(--text); margin:0; line-height:1.15; }
.lvt-pop-sub { font-size:.69rem; color:var(--muted); margin:0; line-height:1.25; }
.lvt-pop-x { flex:0 0 auto; align-self:flex-start; width:26px; height:26px; border:0; border-radius:8px; cursor:pointer; line-height:0;
  color:var(--muted); background:rgba(28,36,56,.06); display:grid; place-items:center; transition:background .15s ease, color .15s ease, transform .12s ease; }
.lvt-pop-x:hover { background:rgba(28,36,56,.12); color:var(--text); }
.lvt-pop-x:active { transform:scale(.92); }
.lvt-pop-arrow { position:absolute; width:11px; height:11px; rotate:45deg;
  background:linear-gradient(135deg, rgba(255,255,255,.92), rgba(255,255,255,.82));
  border:1px solid rgba(255,255,255,.72); }

/* ── popover-scoped control primitives (the .halo ones don't reach the portal) ── */
.lvt-pop .input {
  width:100%; font:inherit; font-size:.9rem; color:var(--text);
  padding:.55rem .7rem; border-radius:var(--r-input); border:1px solid var(--border);
  background:var(--card); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px);
  box-shadow:0 1px 1px rgba(16,18,40,.04) inset; transition:border-color .15s ease, box-shadow .15s ease;
}
.lvt-pop .input::placeholder { color:var(--muted); }
.lvt-pop .input:focus, .lvt-pop .input:focus-visible {
  outline:none; border-color:color-mix(in srgb, var(--pa) 62%, transparent);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--pa) 22%, transparent);
}
.lvt-pop .btn {
  position:relative; font:inherit; font-size:.84rem; font-weight:600; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:.4rem;
  padding:.5rem .85rem; border-radius:11px; color:var(--text); border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.64));
  box-shadow:0 1px 0 rgba(255,255,255,.8) inset, 0 4px 10px -7px rgba(16,18,40,.4);
  transition:transform .12s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
}
.lvt-pop .btn:hover { transform:translateY(-1px); box-shadow:0 1px 0 rgba(255,255,255,.9) inset, 0 8px 16px -8px rgba(16,18,40,.42); border-color:color-mix(in srgb, var(--pa) 32%, var(--border)); }
.lvt-pop .btn:active { transform:translateY(0) scale(.97); }
.lvt-pop .btn.ghost { background:rgba(255,255,255,.42); box-shadow:none; }
.lvt-pop .btn.ghost:hover { background:rgba(255,255,255,.72); box-shadow:0 4px 10px -7px rgba(16,18,40,.35); }
.lvt-pop .btn:focus-visible { outline:none; box-shadow:0 0 0 3px color-mix(in srgb, var(--pa) 32%, transparent); }

/* segmented stepper (reward count) */
.lvt-pop-step { display:inline-flex; align-items:stretch; border:1px solid var(--border); border-radius:12px; overflow:hidden;
  background:var(--card); box-shadow:0 1px 1px rgba(16,18,40,.04) inset; }
.lvt-pop-step button { width:38px; border:0; background:transparent; color:var(--text); font-size:1.15rem; line-height:0; cursor:pointer;
  display:grid; place-items:center; transition:background .14s ease; }
.lvt-pop-step button:hover:not(:disabled) { background:color-mix(in srgb, var(--pa) 16%, transparent); }
.lvt-pop-step button:active:not(:disabled) { background:color-mix(in srgb, var(--pa) 26%, transparent); }
.lvt-pop-step button:disabled { opacity:.35; cursor:default; }
.lvt-pop-step .val { min-width:48px; display:grid; place-items:center; font-weight:800; font-variant-numeric:tabular-nums;
  font-size:1.05rem; border-inline:1px solid var(--border); }

.lvt-pop-iconbtn { width:40px; height:40px; flex:0 0 auto; border-radius:11px; border:1px solid var(--border);
  background:color-mix(in srgb, var(--pa) 10%, #fff); display:grid; place-items:center; color:var(--text);
  box-shadow:0 1px 0 rgba(255,255,255,.8) inset; }

@keyframes lvtPopIn { from { opacity:0; transform:translateY(7px) scale(.97) } to { opacity:1; transform:none } }
@media (prefers-reduced-motion:reduce){ .lvt-pop { animation:none } .lvt-pop-x:active { transform:none } }
@media (prefers-reduced-transparency:reduce){
  .lvt-pop { background:#fff !important; -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }
  .lvt-pop .input, .lvt-pop .btn, .lvt-pop-step { -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }
}
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

interface Props {
  anchor: PopAnchor;
  open: boolean;
  onClose: () => void;
  title: string;
  /** One-line caption under the title — tells the merchant what this edits. */
  subtitle?: string;
  /** Small lucide/SVG glyph shown in the accent tile (icon-led identity). */
  icon?: ReactNode;
  /** Per-component accent hex — tints the header tile, focus rings and hovers. */
  accent?: string;
  children: ReactNode;
}

/** Anchored, dismissible editing popover for one card component. */
export function CardPopover({
  anchor,
  open,
  onClose,
  title,
  subtitle,
  icon,
  accent,
  children,
}: Props) {
  ensureStyle();
  const arrowRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles, context, middlewareData, placement } = useFloating<ReferenceType>({
    open,
    onOpenChange: (o) => {
      if (!o) onClose();
    },
    placement: "right-start",
    strategy: "fixed",
    // Position via top/left, NOT transform: the lvtPopIn entrance animation also
    // animates `transform` and its `to { transform: none }` would otherwise clobber
    // Floating UI's positioning transform, snapping the popover to the top-left.
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(12),
      flip({ fallbackPlacements: ["left-start", "bottom", "top"], padding: 10 }),
      shift({ padding: 10 }),
      size({
        padding: 10,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(220, availableHeight)}px`;
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

  // Drive positioning off the anchor (a static rect snapshot or click point).
  // setReference (the PRIMARY reference) both accepts a virtual element and starts
  // whileElementsMounted/autoUpdate — setPositionReference did neither here.
  useEffect(() => {
    refs.setReference(anchor);
  }, [anchor, refs]);

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
          style={{
            ...floatingStyles,
            ...(accent ? ({ ["--pa" as string]: accent } as object) : {}),
          }}
          {...getFloatingProps()}
          aria-label={title}
        >
          <div className="lvt-pop-head">
            {icon && (
              <span className="lvt-pop-mark" aria-hidden="true">
                {icon}
              </span>
            )}
            <div className="lvt-pop-titles">
              <p className="lvt-pop-title">{title}</p>
              {subtitle && <p className="lvt-pop-sub">{subtitle}</p>}
            </div>
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

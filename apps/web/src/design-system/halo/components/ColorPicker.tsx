import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ColorPickerProps {
  /** Hex color, e.g. "#1a1a2e". */
  value: string;
  onChange: (hex: string) => void;
  id?: string;
  ariaLabel?: string;
}

/** Curated palette — loyalty-card friendly darks, brand hues, and accents. */
const PALETTE = [
  "#1a1a2e", "#16213e", "#0f3460", "#1b2430", "#222831", "#2d3142",
  "#5BA7C9", "#3a86ff", "#4361ee", "#7209b7", "#9d4edd", "#b5179e",
  "#06d6a0", "#2a9d8f", "#43aa8b", "#f4a261", "#f3722c", "#e76f51",
  "#ef476f", "#d62828", "#ffd166", "#e0e0f0", "#f4f4f7", "#ffffff",
];

const STYLE_ID = "lvt-cp-style";
const CSS = `
.lvt-cp-trigger{ display:flex; align-items:center; gap:.6rem; width:100%; font:inherit; font-size:.9rem;
  color:var(--text,#20242A); background:var(--card,#fff); border:1px solid rgba(20,24,32,.14);
  border-radius:var(--r-input,12px); padding:.5rem .65rem; cursor:pointer;
  transition:border-color .15s, box-shadow .15s; box-shadow:var(--shadow-soft); }
.lvt-cp-trigger:hover{ border-color:rgba(20,24,32,.28); }
.lvt-cp-trigger:focus-visible{ outline:none; border-color:#5BA7C9; box-shadow:0 0 0 3px rgba(91,167,201,.26); }
.lvt-cp-sw{ width:26px; height:26px; border-radius:7px; flex-shrink:0; border:1px solid rgba(0,0,0,.18); box-shadow:inset 0 0 0 1px rgba(255,255,255,.25); }
.lvt-cp-hex{ font-variant-numeric:tabular-nums; letter-spacing:.02em; text-transform:uppercase; color:var(--muted,#6F7684); }
.lvt-cp-pop{ position:fixed; z-index:1100; background:#fff; border:1px solid rgba(20,24,32,.12);
  border-radius:14px; box-shadow:0 18px 50px -20px rgba(16,18,27,.5); padding:.85rem; width:236px;
  animation:lvtPop .14s ease-out both; }
.lvt-cp-grid{ display:grid; grid-template-columns:repeat(6,1fr); gap:.4rem; }
.lvt-cp-cell{ aspect-ratio:1; border-radius:8px; cursor:pointer; border:1px solid rgba(0,0,0,.14);
  transition:transform .1s, box-shadow .12s; padding:0; }
.lvt-cp-cell:hover{ transform:translateY(-1px); box-shadow:0 4px 10px -4px rgba(0,0,0,.4); }
.lvt-cp-cell[aria-pressed="true"]{ box-shadow:0 0 0 2px #5BA7C9, 0 0 0 4px rgba(91,167,201,.3); }
.lvt-cp-cell:focus-visible{ outline:none; box-shadow:0 0 0 2px #5BA7C9; }
.lvt-cp-foot{ display:flex; align-items:center; gap:.5rem; margin-top:.7rem; }
.lvt-cp-native{ width:34px; height:34px; padding:0; border:1px solid rgba(0,0,0,.14); border-radius:8px; background:none; cursor:pointer; }
.lvt-cp-input{ flex:1; min-width:0; font:inherit; font-size:.85rem; text-transform:uppercase;
  color:var(--text,#20242A); background:#F7F9FB; border:1px solid rgba(20,24,32,.14); border-radius:8px; padding:.45rem .55rem; outline:none; }
.lvt-cp-input:focus{ border-color:#5BA7C9; box-shadow:0 0 0 3px rgba(91,167,201,.22); }
@media (prefers-reduced-motion: reduce){ .lvt-cp-pop{ animation:none; } .lvt-cp-cell{ transition:none; } }
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

/** Swatch trigger that opens a palette + native color + hex input. */
export function ColorPicker({ value, onChange, id, ariaLabel }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  ensureStyle();
  useEffect(() => setHex(value), [value]);

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.bottom + 6 });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const commit = (h: string) => {
    setHex(h);
    if (isHex(h)) onChange(h);
  };

  return (
    <>
      <button ref={triggerRef} id={id} type="button" className="lvt-cp-trigger" aria-label={ariaLabel}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="lvt-cp-sw" style={{ background: value }} aria-hidden="true" />
        <span className="lvt-cp-hex">{value.toUpperCase()}</span>
      </button>

      {open && rect && createPortal(
        <div ref={popRef} className="lvt-cp-pop" role="dialog" aria-label="Choose a color"
          style={{ left: rect.left, top: rect.top }}>
          <div className="lvt-cp-grid">
            {PALETTE.map((c) => (
              <button key={c} type="button" className="lvt-cp-cell" aria-label={c} title={c}
                aria-pressed={c.toLowerCase() === value.toLowerCase()}
                style={{ background: c }} onClick={() => { commit(c); setOpen(false); }} />
            ))}
          </div>
          <div className="lvt-cp-foot">
            <input className="lvt-cp-native" type="color" aria-label="Custom color"
              value={isHex(hex) ? hex : "#000000"} onChange={(e) => commit(e.target.value)} />
            <input className="lvt-cp-input" type="text" aria-label="Hex color" maxLength={7}
              value={hex} onChange={(e) => commit(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

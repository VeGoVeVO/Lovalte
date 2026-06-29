import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ColorPickerProps {
  /** Hex color, e.g. "#1a1a2e". */
  value: string;
  onChange: (hex: string) => void;
  id?: string;
  ariaLabel?: string;
  /** Open the wheel immediately (e.g. clicking the card background = pick bg now). */
  defaultOpen?: boolean;
  /** Notified whenever the wheel opens/closes (so a parent can keep its chip mounted). */
  onOpenChange?: (open: boolean) => void;
}

/** Curated palette - loyalty-card friendly darks, brand hues, and accents. */
const PALETTE = [
  "#1a1a2e",
  "#16213e",
  "#0f3460",
  "#222831",
  "#5c1f29",
  "#2d3142",
  "#5BA7C9",
  "#3a86ff",
  "#4361ee",
  "#7209b7",
  "#9d4edd",
  "#b5179e",
  "#06d6a0",
  "#2a9d8f",
  "#43aa8b",
  "#f4a261",
  "#f3722c",
  "#e76f51",
  "#ef476f",
  "#d62828",
  "#ffd166",
  "#e0e0f0",
  "#f4f4f7",
  "#ffffff",
];

// ── Color math (HSV <-> RGB <-> hex) ──────────────────────────────────────────
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/.{2}/g);
  return m && m[0] && m[1] && m[2]
    ? [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)]
    : [0, 0, 0];
}
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

const STYLE_ID = "lvt-cp-style";
const CSS = `
.lvt-cp-trigger{ display:flex; align-items:center; gap:.6rem; width:100%; min-width:0; font:inherit; font-size:.9rem;
  color:var(--text,#20242A); background:var(--card,#fff); border:1px solid rgba(20,24,32,.14);
  border-radius:var(--r-input,12px); padding:.5rem .65rem; cursor:pointer;
  transition:border-color .15s, box-shadow .15s; box-shadow:var(--shadow-soft); }
.lvt-cp-trigger:hover{ border-color:rgba(20,24,32,.28); }
.lvt-cp-trigger:focus-visible{ outline:none; border-color:#5BA7C9; box-shadow:0 0 0 3px rgba(91,167,201,.26); }
.lvt-cp-sw{ width:26px; height:26px; border-radius:7px; flex-shrink:0; border:1px solid rgba(0,0,0,.18); box-shadow:inset 0 0 0 1px rgba(255,255,255,.25); }
.lvt-cp-hex{ font-variant-numeric:tabular-nums; letter-spacing:.02em; text-transform:uppercase; color:var(--muted,#6F7684); overflow:hidden; text-overflow:ellipsis; }
.lvt-cp-pop{ position:fixed; z-index:2500;
  background:linear-gradient(180deg, rgba(255,255,255,.94), rgba(255,255,255,.82));
  -webkit-backdrop-filter:blur(30px) saturate(185%); backdrop-filter:blur(30px) saturate(185%);
  border:1px solid rgba(255,255,255,.72);
  border-radius:16px; padding:.85rem; width:248px;
  box-shadow:0 1px 0 rgba(255,255,255,.85) inset, 0 24px 60px -22px rgba(16,18,40,.5), 0 2px 8px -3px rgba(16,18,40,.14);
  animation:lvtPop .14s ease-out both; }
@media (prefers-reduced-transparency:reduce){ .lvt-cp-pop{ background:#fff; -webkit-backdrop-filter:none; backdrop-filter:none; } }
.lvt-cp-sq{ position:relative; height:120px; border-radius:10px; cursor:crosshair; touch-action:none; }
.lvt-cp-hue{ position:relative; height:14px; border-radius:8px; margin-top:.55rem; cursor:pointer; touch-action:none;
  background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00); }
.lvt-cp-thumb{ position:absolute; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.4); pointer-events:none; }
.lvt-cp-rgb{ display:flex; gap:.4rem; margin-top:.6rem; }
.lvt-cp-rgb label{ flex:1; display:flex; align-items:center; gap:.25rem; font-size:.72rem; font-weight:700; color:#6F7684; }
.lvt-cp-rgb input{ width:100%; min-width:0; font:inherit; font-size:.8rem; text-align:center;
  border:1px solid rgba(20,24,32,.14); border-radius:7px; padding:.35rem .2rem; }
.lvt-cp-grid{ display:grid; grid-template-columns:repeat(8,1fr); gap:.35rem; margin-top:.6rem; }
.lvt-cp-cell{ aspect-ratio:1; border-radius:7px; cursor:pointer; border:1px solid rgba(0,0,0,.14);
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

/** Attach pointer down/move/up so dragging anywhere on an element fires cb(event). */
function dragHandlers(cb: (e: React.PointerEvent) => void) {
  let active = false;
  return {
    onPointerDown: (e: React.PointerEvent) => {
      active = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      cb(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (active) cb(e);
    },
    onPointerUp: () => {
      active = false;
    },
  };
}

/**
 * Color picker: a custom HSV wheel (saturation/value square + hue slider) plus
 * R/G/B inputs, a hex field, the OS-native picker, and a curated palette - so a
 * merchant can land on any exact brand color. Popover is portalled to <body> to
 * escape transformed/blurred ancestors.
 */
export function ColorPicker({
  value,
  onChange,
  id,
  ariaLabel,
  defaultOpen,
  onOpenChange,
}: ColorPickerProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [hex, setHex] = useState(value);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const sqRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  ensureStyle();
  useEffect(() => setHex(value), [value]);
  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);

  const [r, g, b] = hexToRgb(value);
  const [h, s, v] = rgbToHsv(r, g, b);

  const place = () => {
    const rc = triggerRef.current?.getBoundingClientRect();
    if (rc) setRect({ left: rc.left, top: rc.bottom + 6 });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        !popRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const commit = (hx: string) => {
    setHex(hx);
    if (isHex(hx)) onChange(hx);
  };
  const setSV = (e: React.PointerEvent) => {
    const el = sqRef.current;
    if (!el) return;
    const c = el.getBoundingClientRect();
    const ns = clamp01((e.clientX - c.left) / c.width);
    const nv = clamp01(1 - (e.clientY - c.top) / c.height);
    const [R, G, B] = hsvToRgb(h, ns, nv);
    commit(rgbToHex(R, G, B));
  };
  const setHue = (e: React.PointerEvent) => {
    const el = hueRef.current;
    if (!el) return;
    const c = el.getBoundingClientRect();
    const nh = clamp01((e.clientX - c.left) / c.width) * 360;
    const [R, G, B] = hsvToRgb(nh, Math.max(s, 0.05), Math.max(v, 0.05));
    commit(rgbToHex(R, G, B));
  };
  const sqDrag = dragHandlers(setSV);
  const hueDrag = dragHandlers(setHue);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="lvt-cp-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="lvt-cp-sw" style={{ background: value }} aria-hidden="true" />
        <span className="lvt-cp-hex">{value.toUpperCase()}</span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popRef}
            className="lvt-cp-pop"
            role="dialog"
            aria-label="Choose a color"
            style={{ left: rect.left, top: rect.top }}
          >
            <div
              ref={sqRef}
              className="lvt-cp-sq"
              {...sqDrag}
              style={{
                background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${h},100%,50%))`,
              }}
            >
              <span
                className="lvt-cp-thumb"
                style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
              />
            </div>
            <div ref={hueRef} className="lvt-cp-hue" {...hueDrag}>
              <span className="lvt-cp-thumb" style={{ left: `${(h / 360) * 100}%`, top: "50%" }} />
            </div>

            <div className="lvt-cp-rgb">
              {(["R", "G", "B"] as const).map((ch, i) => (
                <label key={ch}>
                  {ch}
                  <input
                    type="number"
                    min={0}
                    max={255}
                    aria-label={`${ch} channel`}
                    value={[r, g, b][i] ?? 0}
                    onChange={(e) => {
                      const arr = [r, g, b];
                      arr[i] = Math.max(0, Math.min(255, Number(e.target.value)));
                      commit(rgbToHex(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0));
                    }}
                  />
                </label>
              ))}
            </div>

            <div className="lvt-cp-grid">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="lvt-cp-cell"
                  aria-label={c}
                  title={c}
                  aria-pressed={c.toLowerCase() === value.toLowerCase()}
                  style={{ background: c }}
                  onClick={() => commit(c)}
                />
              ))}
            </div>

            <div className="lvt-cp-foot">
              <input
                className="lvt-cp-native"
                type="color"
                aria-label="Native color picker"
                value={isHex(hex) ? hex : "#000000"}
                onChange={(e) => commit(e.target.value)}
              />
              <input
                className="lvt-cp-input"
                type="text"
                aria-label="Hex color"
                maxLength={7}
                value={hex}
                onChange={(e) =>
                  commit(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)
                }
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

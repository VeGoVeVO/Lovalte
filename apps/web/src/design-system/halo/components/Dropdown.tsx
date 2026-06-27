import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

const STYLE_ID = "lvt-dd-style";
const CSS = `
.lvt-dd-trigger{ width:100%; display:flex; align-items:center; gap:.5rem; font:inherit; font-size:1rem;
  color:var(--text,#20242A); background:var(--card,#fff); border:1px solid rgba(20,24,32,.14);
  border-radius:var(--r-input,12px); padding:.8rem 1rem; cursor:pointer; text-align:left;
  transition:border-color .15s, box-shadow .15s; box-shadow:var(--shadow-soft); }
.lvt-dd-trigger:hover{ border-color:rgba(20,24,32,.28); }
.lvt-dd-trigger:focus-visible{ outline:none; border-color:#5BA7C9; box-shadow:0 0 0 3px rgba(91,167,201,.26); }
.lvt-dd-trigger[aria-disabled="true"]{ opacity:.55; cursor:not-allowed; }
.lvt-dd-val{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lvt-dd-val.placeholder{ color:var(--muted,#6F7684); }
.lvt-dd-chev{ flex-shrink:0; transition:transform .18s ease; color:var(--muted,#6F7684); }
.lvt-dd-trigger[aria-expanded="true"] .lvt-dd-chev{ transform:rotate(180deg); }
.lvt-dd-pop{ position:fixed; z-index:1100; background:#fff; border:1px solid rgba(20,24,32,.12);
  border-radius:12px; box-shadow:0 18px 50px -20px rgba(16,18,27,.5); overflow:auto; max-height:280px;
  padding:.3rem; animation:lvtPop .14s ease-out both; }
.lvt-dd-opt{ display:flex; align-items:center; gap:.5rem; width:100%; font:inherit; font-size:.95rem;
  color:var(--text,#20242A); background:transparent; border:0; border-radius:8px; padding:.55rem .7rem;
  cursor:pointer; text-align:left; }
.lvt-dd-opt[aria-selected="true"]{ font-weight:600; }
.lvt-dd-opt.active{ background:#F0F6FA; }
.lvt-dd-check{ margin-left:auto; color:#5BA7C9; }
@media (prefers-reduced-motion: reduce){ .lvt-dd-pop{ animation:none; } .lvt-dd-chev{ transition:none; } }
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** Accessible custom select. Portaled listbox (escapes glass/transform ancestors),
 *  full keyboard support, themed to match the design system. */
export function Dropdown({ options, value, onChange, placeholder = "Select…", id, ariaLabel, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  ensureStyle();
  const selected = options.find((o) => o.value === value) ?? null;

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.bottom + 6, width: r.width });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);

  // Close on outside click / scroll / resize
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const reposition = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (i: number) => {
    const opt = options[i];
    if (opt) onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
  };

  useEffect(() => {
    if (open) popRef.current?.querySelector<HTMLElement>(".lvt-dd-opt.active")?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="lvt-dd-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
      >
        <span className={`lvt-dd-val${selected ? "" : " placeholder"}`}>{selected ? selected.label : placeholder}</span>
        <svg className="lvt-dd-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && rect && createPortal(
        <div ref={popRef} className="lvt-dd-pop" role="listbox" aria-activedescendant={`lvt-opt-${active}`}
          style={{ left: rect.left, top: rect.top, width: rect.width }} onKeyDown={onKey}>
          {options.map((o, i) => (
            <button
              key={o.value}
              id={`lvt-opt-${i}`}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`lvt-dd-opt${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              {o.value === value && (
                <svg className="lvt-dd-check" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

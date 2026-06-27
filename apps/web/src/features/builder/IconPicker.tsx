import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { DynamicIcon, iconNames } from "lucide-react/dynamic";
import { Scrollbar } from "../../design-system/halo";
import { useT } from "../../lib/i18n";

/** kebab-case ("a-arrow-down") → readable label ("A Arrow Down"). */
function pretty(name: string): string {
  return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const VISIBLE_CAP = 120;

/** Recognisable starters shown before the user searches (filtered to ones that exist). */
const FEATURED = [
  "coffee", "cup-soda", "beer", "wine", "utensils", "pizza", "ice-cream-cone", "cake",
  "croissant", "cookie", "candy", "apple", "carrot", "sandwich", "salad",
  "star", "heart", "gift", "award", "trophy", "medal", "crown", "gem", "sparkles", "flame",
  "ticket", "tag", "percent", "badge-percent", "shopping-bag", "shopping-cart", "shopping-basket",
  "store", "wallet", "credit-card", "banknote", "coins", "piggy-bank", "receipt",
  "smile", "thumbs-up", "party-popper", "leaf", "flower", "sun", "zap", "bell", "camera",
  "music", "gamepad-2", "palette", "scissors", "shirt", "glasses", "dumbbell", "bike", "car",
  "plane", "rocket", "map-pin", "calendar", "clock", "key", "lock", "shield", "paw-print",
  "dog", "cat", "tree-pine", "droplet", "snowflake", "umbrella", "anchor", "compass", "globe",
];

interface IconPickerProps {
  /** Called with the rendered SVG node + icon name when a glyph is chosen. */
  onPick: (svg: SVGSVGElement, name: string) => void;
  onClose: () => void;
}

/**
 * Modal picker over all ~2,000 Lucide icons. Solid surface (not the Halo glass
 * token, which is translucent and meant for coloured backgrounds). Icons are
 * lazy-loaded per cell and the list is capped + search-filtered. Keyboard
 * accessible: autofocus search, Esc closes, Tab trapped within the dialog.
 */
export function IconPicker({ onPick, onClose }: IconPickerProps) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const all = iconNames as string[];
  const featured = useMemo(() => {
    const set = new Set(all);
    return FEATURED.filter((n) => set.has(n));
  }, [all]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { shown: featured, total: featured.length, mode: "featured" as const };
    const list = all.filter((n) => n.includes(q));
    return { shown: list.slice(0, VISIBLE_CAP), total: list.length, mode: "search" as const };
  }, [query, all, featured]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const pick = (e: React.MouseEvent<HTMLButtonElement>, name: string) => {
    const svg = e.currentTarget.querySelector("svg");
    if (svg) onPick(svg as SVGSVGElement, name);
  };

  // Portal to <body>: a transformed/backdrop-filtered ancestor (Halo glass cards,
  // button hover transforms) would otherwise become the containing block for our
  // position:fixed overlay, shrinking it to the form card instead of the viewport.
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(16,18,27,.62)", backdropFilter: "blur(6px)",
        display: "grid", placeItems: "center", padding: "1.25rem",
      }}
    >
      <style>{`
        .lvt-ip { animation: lvt-ip-in .16s ease-out; }
        @media (prefers-reduced-motion: reduce) { .lvt-ip { animation: none; } }
        @keyframes lvt-ip-in { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: none; } }
        .lvt-ip-search { width: 100%; box-sizing: border-box; font: inherit; font-size: .95rem;
          color: #20242A; background: #fff; border: 1px solid rgba(20,24,32,.16);
          border-radius: 12px; padding: .7rem .9rem .7rem 2.3rem; outline: none; transition: border-color .15s, box-shadow .15s; }
        .lvt-ip-search:focus { border-color: #5BA7C9; box-shadow: 0 0 0 3px rgba(91,167,201,.22); }
        .lvt-ip-cell { display: grid; place-items: center; aspect-ratio: 1; padding: .4rem;
          background: #fff; color: #20242A; border: 1px solid rgba(20,24,32,.10);
          border-radius: 12px; cursor: pointer; transition: transform .1s, border-color .12s, background .12s, box-shadow .12s; }
        .lvt-ip-cell:hover { background: #F4F8FB; border-color: #5BA7C9; transform: translateY(-1px);
          box-shadow: 0 4px 12px -6px rgba(20,24,32,.25); }
        .lvt-ip-cell:focus-visible { outline: none; border-color: #5BA7C9; box-shadow: 0 0 0 3px rgba(91,167,201,.3); }
        .lvt-ip-close { display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0;
          border: 1px solid rgba(20,24,32,.12); background: #fff; border-radius: 10px; cursor: pointer;
          color: #6F7684; font-size: 1.05rem; line-height: 1; transition: background .12s, color .12s; }
        .lvt-ip-close:hover { background: #F4F8FB; color: #20242A; }
      `}</style>

      <div
        ref={dialogRef}
        className="lvt-ip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="icon-picker-title"
        onKeyDown={onKeyDown}
        style={{
          width: "min(680px, 100%)", maxHeight: "min(82vh, 660px)",
          display: "flex", flexDirection: "column",
          background: "#fff", border: "1px solid rgba(20,24,32,.10)",
          borderRadius: 18, boxShadow: "0 30px 90px -28px rgba(16,18,27,.6)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1.1rem 1.25rem 0.9rem" }}>
          <div style={{ flex: 1 }}>
            <h2 id="icon-picker-title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 650, color: "#20242A", letterSpacing: "-0.01em" }}>
              {t("Choose an icon")}
            </h2>
            <p id="icon-results-count" role="status" aria-live="polite"
              style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#6F7684" }}>
              {matches.total === 0
                ? t("No icons match - try another word.")
                : matches.mode === "featured"
                  ? t("Popular icons · {n} in total - search to find any.", { n: all.length })
                  : matches.total > VISIBLE_CAP
                    ? t("Showing {shown} of {total} - keep typing to narrow.", { shown: VISIBLE_CAP, total: matches.total })
                    : matches.total === 1 ? t("1 icon.") : t("{n} icons.", { n: matches.total })}
            </p>
          </div>
          <button type="button" className="lvt-ip-close" onClick={onClose} aria-label={t("Close icon picker")}>✕</button>
        </div>

        {/* Search */}
        <div style={{ padding: "0 1.25rem 0.85rem", position: "relative" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: "1.95rem", top: "50%", transform: "translateY(-50%)", color: "#9aa1ad", display: "grid", placeItems: "center" }}>
            <DynamicIcon name={"search" as never} size={16} />
          </span>
          <input
            id="icon-search"
            className="lvt-ip-search"
            autoFocus
            type="text"
            value={query}
            placeholder={t("Search icons - e.g. coffee, star, gift")}
            aria-label={t("Search {n} icons", { n: all.length })}
            aria-describedby="icon-results-count"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Grid */}
        <Scrollbar style={{ flex: 1, padding: "0.25rem 1.25rem 1.25rem", background: "#FBFCFE", borderTop: "1px solid rgba(20,24,32,.06)" }}>
          {matches.shown.length === 0 ? (
            <p style={{ textAlign: "center", color: "#6F7684", padding: "2.5rem 1rem", fontSize: "0.9rem" }}>
              {t("No icons match - try another word.")}
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))", gap: "0.5rem", paddingTop: "0.75rem" }}>
              {matches.shown.map((name) => (
                <button key={name} type="button" className="lvt-ip-cell" onClick={(e) => pick(e, name)}
                  aria-label={pretty(name)} title={pretty(name)}>
                  <DynamicIcon name={name as never} size={22} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </Scrollbar>
      </div>
    </div>,
    document.body
  );
}

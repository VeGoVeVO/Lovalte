import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useT } from "../../lib/i18n";
import type { PopAnchor } from "./CardPopover";
import type { CardDoc } from "./cardDoc";
import { resolveGoogleDoc } from "./cardDoc";

export type GSlotKind = "logo" | "colors" | "hero" | "textModules" | null;
type Dispatch = (toolId: string, args?: Record<string, unknown>) => void;

interface GoogleCardCanvasProps {
  doc: CardDoc;
  selected?: GSlotKind;
  onSelect?: (slot: GSlotKind, anchor?: PopAnchor) => void;
  dispatch?: Dispatch;
  width?: number; // default 300
  readOnly?: boolean;
}

const NOOP = () => {};

/**
 * Popover anchors as STATIC rect snapshots — immune to DOM remounts between
 * click and FloatingUI positioning. Mirror of CardCanvas.rectAnchor.
 */
const rectAnchor = (el: HTMLElement): PopAnchor => {
  const r = el.getBoundingClientRect();
  return { getBoundingClientRect: () => r };
};

/** WCAG relative-luminance check → Google dark text (#202124) or white, for preview fidelity. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? "#202124" : "#ffffff";
}

/**
 * Uncontrolled contentEditable span — syncs from `value` only when unfocused
 * (no cursor jumps mid-typing). Dispatches on blur, not input, to match the
 * Google override pattern (avoids one dispatch per keystroke).
 */
function Editable({
  value,
  ariaLabel,
  onBlur,
  style,
}: {
  value: string;
  ariaLabel: string;
  onBlur: (v: string) => void;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);
  return (
    <span
      ref={ref}
      className="lvt-ed"
      role="textbox"
      aria-label={ariaLabel}
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onBlur(e.currentTarget.textContent ?? "")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
      style={style}
    />
  );
}

/** 4-colour Google "G" mark for visual authenticity in the card header. */
const GoogleGBadge = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const FONT = "Google Sans, Roboto, -apple-system, system-ui, sans-serif";

/** Faithful Google Wallet Generic pass preview. Natural width 400, scaled to `width`. */
export function GoogleCardCanvas({
  doc,
  selected = null,
  onSelect = NOOP,
  dispatch = NOOP,
  width = 300,
  readOnly = false,
}: GoogleCardCanvasProps) {
  const { t } = useT();
  const g = resolveGoogleDoc(doc);
  const editable = !readOnly;
  const textColor = contrastText(g.bg);
  const mutedColor =
    textColor === "#ffffff" ? "rgba(255,255,255,.6)" : "rgba(32,33,36,.5)";
  const dividerColor =
    textColor === "#ffffff" ? "rgba(255,255,255,.15)" : "rgba(32,33,36,.12)";

  /** Clickable region that opens a popover and highlights when selected. In
   *  readOnly mode degrades to a plain div. Always calls stopPropagation so
   *  nested Regions don't fire their parent's handler. */
  const Region = ({
    kind,
    children,
    style,
    label,
  }: {
    kind: Exclude<GSlotKind, null>;
    children: ReactNode;
    style?: CSSProperties;
    label: string;
  }) => {
    if (!editable) return <div style={style}>{children}</div>;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={t("Edit {label}", { label })}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(kind, rectAnchor(e.currentTarget));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(kind, rectAnchor(e.currentTarget));
          }
        }}
        style={{
          cursor: "pointer",
          outline: selected === kind ? "2.5px solid #5BA7C9" : "none",
          outlineOffset: 3,
          borderRadius: 8,
          ...style,
        }}
      >
        {children}
      </div>
    );
  };

  const heroH = Math.round(width * 0.22);
  const cardH = Math.round(width * 0.62);
  const primaryMod = g.textModules.find((m) => m.id === "primary_points");
  const listMods = g.textModules.filter((m) => m.id !== "primary_points");

  return (
    <div
      style={{
        width,
        height: cardH,
        display: "flex",
        flexDirection: "column",
        background: g.bg,
        color: textColor,
        borderRadius: 16,
        overflow: "hidden",
        fontFamily: FONT,
        userSelect: editable ? "none" : "auto",
        boxShadow:
          "0 1px 0 rgba(255,255,255,.12) inset, 0 20px 50px -20px rgba(0,0,0,.5), 0 8px 20px -10px rgba(0,0,0,.35)",
      }}
    >
      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      <Region
        kind="hero"
        label={t("Hero image")}
        style={{
          position: "relative",
          height: heroH,
          flexShrink: 0,
          borderRadius: 0,
          overflow: "hidden",
        }}
      >
        {g.heroSrc ? (
          <img
            src={g.heroSrc}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {editable && (
              <span style={{ fontSize: 10, opacity: 0.55, color: textColor, letterSpacing: "0.04em" }}>
                {t("Hero image")}
              </span>
            )}
          </div>
        )}
      </Region>

      {/* ── Card body — 'colors' Region ──────────────────────────────────────
           Clicking empty body space opens the bg picker. Inner Regions
           (logo, textModules) stopPropagation so they fire their own slot. */}
      <Region
        kind="colors"
        label={t("Background")}
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderRadius: 0 }}
      >
        {/* Header row — 'logo' Region: logo thumbnail + card title + G badge */}
        <Region
          kind="logo"
          label={t("Logo")}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px 5px", flexShrink: 0, borderRadius: 0 }}
        >
          {/* Logo thumbnail */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              flexShrink: 0,
              overflow: "hidden",
              background: g.logoSrc ? "transparent" : "rgba(255,255,255,.18)",
              border: g.logoSrc || !editable ? "none" : "1.5px dashed rgba(255,255,255,.5)",
            }}
          >
            {g.logoSrc ? (
              <img
                src={g.logoSrc}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : editable ? (
              <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
                <span style={{ fontSize: 14, opacity: 0.75, color: textColor }}>＋</span>
              </div>
            ) : null}
          </div>

          {/* Card title — inline editable; stopPropagates own click so Region doesn't fire */}
          {editable ? (
            <Editable
              value={g.cardTitle}
              ariaLabel={t("Card title")}
              onBlur={(v) => dispatch("google.override.cardTitle", { value: v })}
              style={{ flex: 1, fontSize: 13, fontWeight: 600, color: textColor, minWidth: 0 }}
            />
          ) : (
            <span
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: 600,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {g.cardTitle}
            </span>
          )}

          <GoogleGBadge />
        </Region>

        {/* Thin divider */}
        <div
          style={{ height: 1, background: dividerColor, marginInline: 12, flexShrink: 0 }}
        />

        {/* Primary loyalty value */}
        <div style={{ padding: "7px 12px 3px", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: mutedColor,
              marginBottom: 2,
            }}
          >
            {primaryMod?.header ?? "POINTS"}
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {g.loyaltyDisplay}
          </div>
        </div>

        {/* Text modules list — one Region for the whole list */}
        <Region
          kind="textModules"
          label={t("Text fields")}
          style={{ flex: 1, padding: "4px 12px 2px", minHeight: 0, borderRadius: 0, overflow: "hidden" }}
        >
          {listMods.slice(0, 3).map((m) => (
            <div
              key={m.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: mutedColor,
                  marginRight: 6,
                  flexShrink: 0,
                }}
              >
                {m.header}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: textColor,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.body}
              </span>
            </div>
          ))}
          {listMods.length === 0 && editable && (
            <span style={{ fontSize: 9, opacity: 0.4, color: textColor }}>
              {t("No text fields")}
            </span>
          )}
        </Region>

        {/* QR placeholder strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "3px 12px 7px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: "#ffffff",
              borderRadius: 5,
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2" y="2" width="9" height="9" rx="1.5" fill="none" stroke="#0b0b0b" strokeWidth="1.5" />
              <rect x="4" y="4" width="5" height="5" fill="#0b0b0b" />
              <rect x="13" y="2" width="9" height="9" rx="1.5" fill="none" stroke="#0b0b0b" strokeWidth="1.5" />
              <rect x="15" y="4" width="5" height="5" fill="#0b0b0b" />
              <rect x="2" y="13" width="9" height="9" rx="1.5" fill="none" stroke="#0b0b0b" strokeWidth="1.5" />
              <rect x="4" y="15" width="5" height="5" fill="#0b0b0b" />
              <rect x="13" y="13" width="2" height="2" fill="#0b0b0b" />
              <rect x="16" y="13" width="2" height="2" fill="#0b0b0b" />
              <rect x="19" y="13" width="2" height="2" fill="#0b0b0b" />
              <rect x="13" y="16" width="2" height="2" fill="#0b0b0b" />
              <rect x="16" y="16" width="2" height="2" fill="#0b0b0b" />
              <rect x="19" y="16" width="2" height="2" fill="#0b0b0b" />
              <rect x="13" y="19" width="2" height="2" fill="#0b0b0b" />
              <rect x="16" y="19" width="2" height="2" fill="#0b0b0b" />
              <rect x="19" y="19" width="2" height="2" fill="#0b0b0b" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: mutedColor,
            }}
          >
            QR
          </span>
        </div>
      </Region>
    </div>
  );
}

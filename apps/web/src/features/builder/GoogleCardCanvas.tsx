import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { apiAssetUrl } from "../../lib/api";
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
  width?: number; // default 340
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

/**
 * Faithful Google Wallet GENERIC pass front. Google renders genericObjects with a
 * FIXED template (no layout control), so this mirrors that exact order — verified
 * against the live Wallet render + Google's generic-pass docs:
 *   1. logo (circular) + cardTitle (small)   ← brand label, top row
 *   2. header                                 ← large bold pass title
 *   3. barcode (QR_CODE)                      ← large, centered
 *   4. heroImage                              ← full-width block, BOTTOM (1032×812, ~1.27:1)
 * textModulesData are NOT shown on the front (Details view only, unless a
 * cardTemplateOverride is set — which our backend does not), so they are omitted
 * here to match what users actually see. Natural width 340, scaled to `width`.
 */
export function GoogleCardCanvas({
  doc,
  selected = null,
  onSelect = NOOP,
  dispatch = NOOP,
  width = 340,
  readOnly = false,
}: GoogleCardCanvasProps) {
  const { t } = useT();
  const g = resolveGoogleDoc(doc);
  const editable = !readOnly;
  const textColor = contrastText(g.bg);

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

  // QR sized to dominate the card centre, mirroring the real on-device barcode
  // (Google renders the QR at ~55% of card width with generous padding).
  const qrSize = Math.round(width * 0.54);

  return (
    <div
      // Clicking empty card space picks the background colour (the 'colors' slot).
      // Inner Regions / editables stopPropagation so they fire their own slot.
      onClick={editable ? (e) => onSelect("colors", rectAnchor(e.currentTarget)) : undefined}
      style={{
        width,
        maxWidth: "100%",
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
      {/* ── Top row: circular logo + cardTitle (small brand label) + Google G ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 8px" }}>
        <Region
          kind="logo"
          label={t("Logo")}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            flexShrink: 0,
            overflow: "hidden",
            display: "grid",
            placeItems: "center",
            // Google masks the logo into a circle on a LIGHT tile (not the pass
            // colour). Replicate the white tile so a white/transparent logo shows
            // the same faded/invisible result here as on the real device.
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,.10)",
          }}
        >
          {g.logoSrc ? (
            <img
              src={apiAssetUrl(g.logoSrc)}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            // No logo → Google falls back to the first letter of cardTitle in a disc.
            <span style={{ fontSize: 18, fontWeight: 700, color: g.bg }}>
              {(g.cardTitle.trim()[0] || "L").toUpperCase()}
            </span>
          )}
        </Region>

        {editable ? (
          <Editable
            value={g.cardTitle}
            ariaLabel={t("Card title")}
            onBlur={(v) => dispatch("google.override.cardTitle", { value: v })}
            style={{
              flex: 1,
              fontSize: 12.5,
              fontWeight: 600,
              color: textColor,
              minWidth: 0,
              letterSpacing: "0.01em",
            }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: 12.5,
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
      </div>

      {/* ── Header: large bold pass title (the most prominent text) ──────────── */}
      <div style={{ padding: "0 14px 14px" }}>
        {editable ? (
          <Editable
            value={g.header}
            ariaLabel={t("Pass title")}
            onBlur={(v) => dispatch("google.override.header", { value: v })}
            style={{
              display: "block",
              fontSize: 23,
              fontWeight: 700,
              color: textColor,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          />
        ) : (
          <span
            style={{
              display: "block",
              fontSize: 23,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          >
            {g.header}
          </span>
        )}
      </div>

      {/* ── Barcode: large centered QR (the passId) ─────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 24px" }}>
        <div style={{ background: "#ffffff", padding: 11, borderRadius: 12, lineHeight: 0 }}>
          <QRCodeSVG
            value="LVT-000120"
            size={qrSize}
            bgColor="#ffffff"
            fgColor="#0b0b0b"
            level="M"
          />
        </div>
      </div>

      {/* ── Hero image: full-width banner anchored to the BOTTOM (3:1) ───────── */}
      <Region
        kind="hero"
        label={t("Hero image")}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1032 / 812",
          overflow: "hidden",
          borderRadius: 0,
        }}
      >
        {g.heroSrc ? (
          <img
            src={apiAssetUrl(g.heroSrc)}
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
              background: "rgba(0,0,0,.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {editable && (
              <span
                style={{ fontSize: 10, opacity: 0.55, color: textColor, letterSpacing: "0.04em" }}
              >
                {t("Hero image")}
              </span>
            )}
          </div>
        )}
      </Region>
    </div>
  );
}

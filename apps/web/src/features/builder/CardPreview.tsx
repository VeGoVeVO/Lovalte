/** 1:1 preview of the Apple Wallet **storeCard** this template produces.
 *  Mirrors Apple's real front layout (PassKit Package Format Reference) so
 *  "what you build" matches "what's on the phone":
 *    - logo image + logoText TOP-LEFT; up to 3 header fields TOP-RIGHT
 *    - primary field (1) large, overlaid on the strip image when one is set
 *    - secondary then auxiliary field rows beneath (shared 4-slot pool)
 *    - the barcode CENTERED at the bottom on a white quiet-zone, altText below
 *  Apple does NOT render organizationName, a thumbnail, or any gradient over the
 *  strip on a storeCard, so none are shown. Rendered at the 375pt canvas width
 *  (responsive down on narrow screens) for true 1:1 sizing.
 *  role="img": screen readers treat it as one graphic. */

import type { CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useT } from "../../lib/i18n";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";

export interface PreviewField {
  label: string;
  value: string;
}

interface Props {
  organizationName: string;
  logoText?: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  /** The single storeCard primary field. */
  primaryLabel: string;
  primaryValue: string;
  headerFields?: PreviewField[];
  secondaryFields?: PreviewField[];
  auxiliaryFields?: PreviewField[];
  /** Public URL of the uploaded logo (top-left), if any. */
  logoUrl?: string;
  /** Public URL of the uploaded strip banner (375:144), if any. */
  stripUrl?: string;
  /** Value encoded in the barcode + shown as altText (sample member number). */
  barcodeValue?: string;
}

/** Replace a "{{template}}" placeholder with a sample so the preview reads like
 *  the phone, not raw braces. */
const sample = (v: string, fallback = "—") => (/\{\{.*\}\}/.test(v) ? "120" : v.trim() || fallback);

function FieldCell({
  f,
  align = "left",
  labelStyle,
  valueStyle,
}: {
  f: PreviewField;
  align?: "left" | "right";
  labelStyle: CSSProperties;
  valueStyle: CSSProperties;
}) {
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ ...labelStyle, textAlign: align }}>{f.label || "—"}</div>
      <div style={{ ...valueStyle, textAlign: align }}>{sample(f.value)}</div>
    </div>
  );
}

function FieldRow({
  fields,
  labelStyle,
  valueStyle,
}: {
  fields: PreviewField[];
  labelStyle: CSSProperties;
  valueStyle: CSSProperties;
}) {
  if (fields.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "0 16px",
        justifyContent: fields.length > 1 ? "space-between" : "flex-start",
      }}
    >
      {fields.slice(0, 4).map((f, i) => (
        <div key={i} style={{ minWidth: 0, flex: fields.length > 1 ? "1 1 0" : "0 1 auto" }}>
          <FieldCell f={f} labelStyle={labelStyle} valueStyle={valueStyle} />
        </div>
      ))}
    </div>
  );
}

export function CardPreview({
  organizationName,
  logoText,
  backgroundColor,
  foregroundColor,
  labelColor,
  primaryLabel,
  primaryValue,
  headerFields = [],
  secondaryFields = [],
  auxiliaryFields = [],
  logoUrl,
  stripUrl,
  barcodeValue,
}: Props) {
  const { t } = useT();
  const fg = foregroundColor || "rgb(255,255,255)";
  const bg = backgroundColor || "rgb(26,26,46)";
  const lbl = labelColor || fg;
  // Apple renders logoText (not organizationName); fall back so it is never blank.
  const brand = (logoText && logoText.trim()) || organizationName || t("Your Business");
  const pValue = sample(primaryValue, "0");
  const altText = (barcodeValue && barcodeValue.trim()) || "LVT-000120";

  const labelStyle: CSSProperties = {
    fontSize: 9.5,
    lineHeight: 1.1,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: lbl,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const valueStyle: CSSProperties = {
    fontSize: 14,
    lineHeight: 1.15,
    color: fg,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  return (
    <div
      role="img"
      aria-label={t("Loyalty card preview for {name}", {
        name: organizationName || t("your business"),
      })}
      style={{
        width: "100%",
        maxWidth: 375,
        minHeight: 480,
        display: "flex",
        flexDirection: "column",
        background: bg,
        color: fg,
        borderRadius: 13,
        overflow: "hidden",
        fontFamily: FONT,
        userSelect: "none",
        boxShadow:
          "0 1px 0 rgba(255,255,255,.10) inset, 0 28px 70px -26px rgba(0,0,0,.6), 0 8px 22px -10px rgba(0,0,0,.4)",
      }}
    >
      {/* ── Header: logo + logoText (left) · header fields (right) ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px 10px",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}
        >
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              style={{
                height: 30,
                width: "auto",
                maxWidth: 120,
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: fg,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {brand}
          </span>
        </div>
        {headerFields.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 12,
              flex: "0 1 auto",
              minWidth: 0,
              maxWidth: "55%",
              justifyContent: "flex-end",
            }}
          >
            {headerFields.slice(0, 3).map((f, i) => (
              <FieldCell
                key={i}
                f={f}
                align="right"
                labelStyle={labelStyle}
                valueStyle={valueStyle}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Primary field — value on TOP, label beneath (matches Apple Wallet) ── */}
      {stripUrl ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "375 / 144",
            overflow: "hidden",
          }}
        >
          <img
            src={stripUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div style={{ position: "absolute", left: 16, bottom: 12, right: 16, minWidth: 0 }}>
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                lineHeight: 1,
                color: fg,
                letterSpacing: "-0.03em",
              }}
            >
              {pValue}
            </div>
            <div style={{ ...labelStyle, fontSize: 13, color: lbl, marginTop: 3 }}>
              {primaryLabel || "POINTS"}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: "4px 16px 14px" }}>
          <div
            style={{
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1,
              color: fg,
              letterSpacing: "-0.04em",
            }}
          >
            {pValue}
          </div>
          <div style={{ ...labelStyle, fontSize: 15, letterSpacing: "0.03em", marginTop: 6 }}>
            {primaryLabel || "POINTS"}
          </div>
        </div>
      )}

      {/* ── Secondary + auxiliary field rows ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0" }}>
        <FieldRow fields={secondaryFields} labelStyle={labelStyle} valueStyle={valueStyle} />
        <FieldRow fields={auxiliaryFields} labelStyle={labelStyle} valueStyle={valueStyle} />
      </div>

      {/* Spacer: pushes the barcode to the bottom like a real tall pass. */}
      <div style={{ flex: 1, minHeight: 16 }} />

      {/* ── Barcode centered on a white quiet-zone, altText below ── */}
      <div
        style={{
          padding: "12px 16px 18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div style={{ background: "#fff", borderRadius: 6, padding: 10, lineHeight: 0 }}>
          <QRCodeSVG value={altText} size={118} bgColor="#ffffff" fgColor="#0b0b0b" level="M" />
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.06em", color: fg, opacity: 0.7 }}>
          {altText}
        </div>
      </div>
    </div>
  );
}

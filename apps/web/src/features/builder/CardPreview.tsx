/** Live preview of a loyalty card rendered with the chosen colors and fields.
 *  Mimics the Apple Wallet storeCard layout at ~375 px width.
 *  role="img" so screen readers treat it as a decorative graphic, not a form. */

import { useT } from "../../lib/i18n";

interface Props {
  organizationName: string;
  logoText?: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  primaryLabel: string;
  primaryValue: string;
  /** Public ref of the chosen card icon, shown top-right (falls back to a star). */
  iconUrl?: string;
}

export function CardPreview({
  organizationName,
  logoText,
  backgroundColor,
  foregroundColor,
  labelColor,
  primaryLabel,
  primaryValue,
  iconUrl,
}: Props) {
  const { t } = useT();
  const lbl = labelColor || foregroundColor;

  return (
    <div
      role="img"
      aria-label={t("Loyalty card preview for {name}", { name: organizationName || t("your business") })}
      style={{
        background: backgroundColor || "rgb(26,26,46)",
        borderRadius: 20,
        padding: "1.5rem 1.75rem",
        width: "100%",
        maxWidth: 340,
        minHeight: 220,
        boxShadow:
          "0 2px 0 rgba(255,255,255,.08) inset, 0 20px 60px -24px rgba(0,0,0,.6), 0 4px 16px -8px rgba(0,0,0,.35)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
        color: foregroundColor || "rgb(224,224,240)",
        userSelect: "none",
      }}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          {logoText && (
            <div
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: lbl,
                marginBottom: 3,
                fontWeight: 500,
              }}
            >
              {logoText}
            </div>
          )}
          <div style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.015em" }}>
            {organizationName || t("Your Business")}
          </div>
        </div>
        {/* Card icon (chosen Lucide/uploaded image) - falls back to a tier star */}
        <div
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(255,255,255,.14)",
            border: "1px solid rgba(255,255,255,.24)",
            display: "grid",
            placeItems: "center",
            fontSize: "0.85rem",
            overflow: "hidden",
          }}
        >
          {iconUrl ? (
            <img src={iconUrl} alt="" width={32} height={32}
              style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            "★"
          )}
        </div>
      </div>

      {/* ── Primary field ──────────────────────────────────────────────────── */}
      <div style={{ marginBlock: "1.25rem 0.5rem" }}>
        <div
          style={{
            fontSize: "0.6rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: lbl,
            marginBottom: 4,
            fontWeight: 500,
          }}
        >
          {primaryLabel || "POINTS"}
        </div>
        <div
          style={{
            fontSize: "2.25rem",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.035em",
          }}
        >
          {primaryValue || "0"}
        </div>
      </div>

      {/* ── QR placeholder ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          aria-hidden="true"
          style={{
            width: 50,
            height: 50,
            borderRadius: 8,
            background: "rgba(255,255,255,.92)",
            display: "grid",
            placeItems: "center",
            padding: 5,
          }}
        >
          {/* Schematic QR finder patterns (decorative) */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" role="presentation">
            <rect x="1" y="1" width="14" height="14" rx="2" fill="#111" />
            <rect x="4" y="4" width="8" height="8" rx="1" fill="white" />
            <rect x="21" y="1" width="14" height="14" rx="2" fill="#111" />
            <rect x="24" y="4" width="8" height="8" rx="1" fill="white" />
            <rect x="1" y="21" width="14" height="14" rx="2" fill="#111" />
            <rect x="4" y="24" width="8" height="8" rx="1" fill="white" />
            <rect x="21" y="21" width="6" height="6" fill="#111" />
            <rect x="29" y="21" width="6" height="6" fill="#111" />
            <rect x="21" y="29" width="6" height="6" fill="#111" />
            <rect x="29" y="29" width="6" height="6" fill="#111" />
          </svg>
        </div>
      </div>
    </div>
  );
}

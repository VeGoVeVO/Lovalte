/** Faithful preview of the Apple Wallet storeCard this template produces.
 *  Mirrors Apple's real layout so "what you build" matches "what's on the phone":
 *    - brand (logoText, or org name as fallback) + optional logo image, TOP-LEFT
 *    - primary field value, overlaid on the strip image when one is set
 *    - the QR barcode CENTERED at the bottom on a white quiet-zone
 *  Note: Apple does NOT render organizationName on the pass front and storeCards
 *  have no thumbnail slot, so neither is shown here.
 *  role="img" so screen readers treat it as a single decorative graphic. */

import { useT } from "../../lib/i18n";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";

interface Props {
  organizationName: string;
  logoText?: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  primaryLabel: string;
  primaryValue: string;
  /** Public URL of the uploaded logo (shown top-left), if any. */
  logoUrl?: string;
  /** Public URL of the uploaded strip banner (3:1), if any. */
  stripUrl?: string;
}

/** Decorative QR-looking matrix: 3 finder patterns + deterministic modules. */
function Qr({ size = 120, fg = "#0b0b0b" }: { size?: number; fg?: string }) {
  const N = 21;
  const cell = size / N;
  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (isFinder(r, c)) continue;
      if ((r * 31 + c * 17 + (r ^ c) * 7) % 5 < 2)
        rects.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={fg} />);
    }
  const finder = (ox: number, oy: number) => (
    <g key={`${ox}_${oy}`}>
      <rect x={ox * cell} y={oy * cell} width={7 * cell} height={7 * cell} fill={fg} />
      <rect x={(ox + 1) * cell} y={(oy + 1) * cell} width={5 * cell} height={5 * cell} fill="#fff" />
      <rect x={(ox + 2) * cell} y={(oy + 2) * cell} width={3 * cell} height={3 * cell} fill={fg} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="presentation">
      {rects}
      {finder(0, 0)}
      {finder(N - 7, 0)}
      {finder(0, N - 7)}
    </svg>
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
  logoUrl,
  stripUrl,
}: Props) {
  const { t } = useT();
  const lbl = labelColor || foregroundColor;
  // Apple renders logoText (not organizationName); fall back so it is never blank.
  const brand = (logoText && logoText.trim()) || organizationName || t("Your Business");
  // A "{{template}}" value is replaced with the member's number on the real pass;
  // show a sample so the preview reads like the phone, not raw braces.
  const value = /\{\{.*\}\}/.test(primaryValue) ? "120" : primaryValue || "0";

  return (
    <div
      role="img"
      aria-label={t("Loyalty card preview for {name}", { name: organizationName || t("your business") })}
      style={{
        width: "100%",
        maxWidth: 320,
        background: backgroundColor || "rgb(26,26,46)",
        color: foregroundColor || "rgb(224,224,240)",
        borderRadius: 16,
        overflow: "hidden",
        fontFamily: FONT,
        userSelect: "none",
        boxShadow:
          "0 1px 0 rgba(255,255,255,.10) inset, 0 24px 60px -28px rgba(0,0,0,.55), 0 6px 18px -10px rgba(0,0,0,.35)",
      }}
    >
      {/* ── Header: logo / brand top-left (header fields would sit top-right) ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 16px 11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ height: 26, width: "auto", objectFit: "contain" }} />}
          <span style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {brand}
          </span>
        </div>
      </div>

      {/* ── Strip band + primary overlaid, OR primary on the background ── */}
      {stripUrl ? (
        <div style={{ position: "relative", width: "100%", aspectRatio: "375 / 123", overflow: "hidden" }}>
          <img src={stripUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.42))" }} />
          <div style={{ position: "absolute", left: 16, bottom: 10, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
            <div style={{ fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#fff", opacity: 0.92, fontWeight: 600 }}>
              {primaryLabel || "POINTS"}
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: 700, lineHeight: 1, color: "#fff", letterSpacing: "-0.03em" }}>{value}</div>
          </div>
        </div>
      ) : (
        <div style={{ padding: "4px 16px 14px" }}>
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", color: lbl, fontWeight: 600, marginBottom: 5 }}>
            {primaryLabel || "POINTS"}
          </div>
          <div style={{ fontSize: "2.1rem", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.035em" }}>{value}</div>
        </div>
      )}

      {/* ── Barcode centered at the bottom on a white quiet-zone ── */}
      <div style={{ padding: "14px 16px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
        <div style={{ background: "#fff", borderRadius: 10, padding: 11, lineHeight: 0, boxShadow: "0 2px 8px -4px rgba(0,0,0,.4)" }}>
          <Qr size={120} />
        </div>
        <div style={{ fontSize: "0.62rem", letterSpacing: "0.04em", color: foregroundColor, opacity: 0.62 }}>{brand}</div>
      </div>
    </div>
  );
}

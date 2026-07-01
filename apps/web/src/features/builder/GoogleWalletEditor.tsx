import { useRef, useState, type ChangeEvent } from "react";
import { GlassButton, ColorPicker } from "../../design-system/halo";
import { apiAssetUrl } from "../../lib/api";
import { useT } from "../../lib/i18n";
import {
  useCreateTemplate,
  useUpdateTemplate,
  type CardTemplateDTO,
  type LoyaltyType,
} from "./useTemplates";
import { useUploadImage, fileToDataUrl, validateImageFile } from "./useImages";

interface Props {
  initial: CardTemplateDTO | null;
  onClose: () => void;
}

const CARD_TYPES: { key: LoyaltyType; label: string; icon: string }[] = [
  { key: "points", label: "Points", icon: "⭐" },
  { key: "stamps", label: "Stamps", icon: "🔖" },
  { key: "cashback", label: "Cashback", icon: "💰" },
];

function GWalletPreview({
  bg,
  fg,
  name,
  org,
  cardType,
  threshold,
  logoUrl,
}: {
  bg: string;
  fg: string;
  name: string;
  org: string;
  cardType: LoyaltyType;
  threshold: number;
  logoUrl: string;
}) {
  const valueLabel =
    cardType === "cashback"
      ? `$${(threshold / 100).toFixed(2)}`
      : cardType === "stamps"
        ? `${threshold} stamps`
        : `${threshold.toLocaleString()} POINTS`;

  return (
    <div
      style={{
        width: 320,
        height: 168,
        borderRadius: 16,
        background: bg,
        boxShadow: "0 4px 24px rgba(0,0,0,.22)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {logoUrl ? (
          <img
            src={apiAssetUrl(logoUrl)}
            alt=""
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              objectFit: "contain",
              background: "rgba(255,255,255,.22)",
            }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: "rgba(255,255,255,.22)",
              display: "grid",
              placeItems: "center",
              fontSize: 16,
              color: fg,
              fontWeight: 700,
            }}
          >
            {(name[0] || "G").toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: fg, opacity: 0.7, fontWeight: 500 }}>
            {org || "Organization"}
          </div>
          <div
            style={{
              fontSize: 13,
              color: fg,
              fontWeight: 700,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name || "Card name"}
          </div>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-label="Google"
          style={{ flexShrink: 0, opacity: 0.6 }}
        >
          <path
            fill={fg}
            d="M21.35 11.1H12v2.92h5.35c-.23 1.22-1.4 3.58-5.35 3.58-3.22 0-5.84-2.66-5.84-5.6s2.62-5.6 5.84-5.6c1.83 0 3.06.78 3.76 1.46l2.56-2.48C16.65 3.78 14.5 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.19 0 8.63-3.65 8.63-8.79 0-.59-.07-1.04-.13-1.31z"
          />
        </svg>
      </div>

      {/* Center value */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: fg, letterSpacing: "-0.02em" }}>
          {valueLabel}
        </div>
        <div
          style={{
            fontSize: 11,
            color: fg,
            opacity: 0.7,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {cardType}
        </div>
      </div>

      {/* Barcode strip */}
      <div
        style={{
          height: 26,
          background: "rgba(255,255,255,.15)",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          padding: "0 6px",
        }}
      >
        {Array.from({ length: 28 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? 3 : 1,
              height: i % 5 === 0 ? "80%" : i % 2 === 0 ? "65%" : "50%",
              background: fg,
              opacity: 0.45,
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function GoogleWalletEditor({ initial, onClose }: Props) {
  const { t } = useT();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const uploadImg = useUploadImage();

  const [name, setName] = useState(initial?.name ?? "");
  const [org, setOrg] = useState(initial?.brand.organizationName ?? "");
  const [bg, setBg] = useState(initial?.brand.backgroundColor ?? "#1A73E8");
  const [fg, setFg] = useState(initial?.brand.foregroundColor ?? "#FFFFFF");
  const [cardType, setCardType] = useState<LoyaltyType>(initial?.rewardRule.cardType ?? "points");
  const [pointsPerVisit, setPointsPerVisit] = useState(initial?.rewardRule.pointsPerVisit ?? 1);
  const [rewardThreshold, setRewardThreshold] = useState(
    initial?.rewardRule.rewardThreshold ?? 100,
  );
  const [logoUrl, setLogoUrl] = useState(initial?.brand.logoRef ?? "");
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const [status, setStatus] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);

  const onLogoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setStatus(invalid);
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await uploadImg.mutateAsync({ kind: "logo", source: "upload", dataUrl });
      setLogoUrl(res.url);
    } catch (err) {
      setStatus((err as { message?: string })?.message ?? t("Upload failed."));
    }
  };

  const busy = createMut.isPending || updateMut.isPending || uploadImg.isPending;

  const save = async () => {
    setStatus(null);
    try {
      const input = {
        name,
        organizationName: org,
        backgroundColor: bg,
        foregroundColor: fg,
        labelColor: undefined,
        headerFields: [] as { key: string; label: string; valueTemplate: string }[],
        primaryFields: [{ key: "points", label: "POINTS", valueTemplate: "{{balance}}" }],
        secondaryFields: [] as { key: string; label: string; valueTemplate: string }[],
        auxiliaryFields: [] as { key: string; label: string; valueTemplate: string }[],
        backFields: [] as { key: string; label: string; valueTemplate: string }[],
        pointsPerVisit,
        rewardThreshold,
        cardType,
        tierRules: [] as { label: string; minPoints: number }[],
        walletPlatform: "google" as const,
      };
      let id = savedId;
      if (id) {
        await updateMut.mutateAsync({ id, input });
      } else {
        const tmpl = await createMut.mutateAsync(input);
        id = tmpl.id;
        setSavedId(id);
      }
      setStatus(t("Draft saved."));
    } catch (e) {
      setStatus((e as { message?: string })?.message ?? t("Save failed."));
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <GlassButton type="button" variant="ghost" onClick={onClose}>
          {t("← Back")}
        </GlassButton>
        <h2
          className="cardt"
          style={{ margin: 0, flex: 1, textAlign: "center", fontSize: "1.1rem", fontWeight: 600 }}
        >
          {t("Google Wallet card")}
        </h2>
        <GlassButton type="button" onClick={() => void save()} disabled={busy}>
          {t("Save draft")}
        </GlassButton>
      </div>

      {/* Live preview */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
        <GWalletPreview
          bg={bg}
          fg={fg}
          name={name}
          org={org}
          cardType={cardType}
          threshold={rewardThreshold}
          logoUrl={logoUrl}
        />
      </div>

      {/* Edit fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Card name")}
          </span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("My Loyalty Card")}
            maxLength={64}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Organization name")}
          </span>
          <input
            className="input"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder={t("Your Business")}
            maxLength={64}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Background color")}
          </span>
          <ColorPicker ariaLabel={t("Background color")} value={bg} onChange={setBg} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Text color")}
          </span>
          <ColorPicker ariaLabel={t("Text color")} value={fg} onChange={setFg} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Loyalty type")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {CARD_TYPES.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                className={cardType === key ? "btn" : "btn ghost"}
                onClick={() => setCardType(key)}
                style={{ flex: 1, fontSize: ".84rem", padding: "0.45rem 0.5rem" }}
              >
                {icon} {t(label)}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Points per visit")}
          </span>
          <input
            className="input"
            type="number"
            min={1}
            value={pointsPerVisit}
            onChange={(e) => setPointsPerVisit(Math.max(1, Number(e.target.value)))}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Reward threshold")}
          </span>
          <input
            className="input"
            type="number"
            min={1}
            value={rewardThreshold}
            onChange={(e) => setRewardThreshold(Math.max(1, Number(e.target.value)))}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            className="body"
            style={{
              fontSize: ".78rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {t("Logo")}
          </span>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={onLogoFile}
            style={{ display: "none" }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <div style={{ display: "flex", gap: 6 }}>
            <GlassButton
              type="button"
              variant="ghost"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadImg.isPending}
            >
              {logoUrl ? t("Replace logo") : t("Upload logo")}
            </GlassButton>
            {logoUrl && (
              <GlassButton type="button" variant="ghost" onClick={() => setLogoUrl("")}>
                {t("Remove")}
              </GlassButton>
            )}
          </div>
        </div>
      </div>

      {status && (
        <p
          role="status"
          aria-live="polite"
          className="body"
          style={{
            textAlign: "center",
            marginTop: 18,
            color: /fail|error/i.test(status) ? "#c0392b" : "var(--text)",
          }}
        >
          {status}
        </p>
      )}
    </div>
  );
}

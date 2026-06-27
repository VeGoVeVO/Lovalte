import { useRef, useState, type ChangeEvent } from "react";
import { GlassButton } from "../../design-system/halo";
import { IconPicker } from "./IconPicker";
import { svgToPngDataUrl } from "./lucideRaster";
import { useUploadImage, fileToDataUrl, validateImageFile } from "./useImages";

interface AssetFieldProps {
  kind: "icon" | "logo" | "strip";
  label: string;
  hint: string;
  /** Current image ref ("/api/v1/images/:id"), or "" when none chosen. */
  value: string;
  onChange: (url: string) => void;
  /** rgb(...) the picked Lucide icon is recoloured to (icon kind only). */
  iconColor?: string;
}

/**
 * One card image slot: shows a live thumbnail and lets the merchant either
 * upload a file or (for the icon) pick from the full Lucide set. Both paths store
 * the image in the card-image DB and hand back its public ref via `onChange`.
 */
export function AssetField({ kind, label, hint, value, onChange, iconColor }: AssetFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadImage();
  const busy = upload.isPending;
  const errorId = `asset-err-${kind}`;

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected later
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await upload.mutateAsync({ kind, source: "upload", dataUrl });
      onChange(res.url);
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Upload failed.");
    }
  };

  const handlePick = async (svg: SVGSVGElement, name: string) => {
    void name;
    setPicking(false);
    setError(null);
    try {
      const dataUrl = await svgToPngDataUrl(svg, 87, iconColor ?? "#111111");
      const res = await upload.mutateAsync({ kind, source: "lucide", dataUrl });
      onChange(res.url);
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Could not save icon.");
    }
  };

  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
      {/* Thumbnail */}
      <div
        aria-hidden={!value}
        style={{
          flexShrink: 0, width: 56, height: 56, borderRadius: "var(--r-input, 8px)",
          border: "1px solid var(--border, rgba(0,0,0,.12))", background: "var(--card, #f4f4f7)",
          display: "grid", placeItems: "center", overflow: "hidden",
        }}
      >
        {value ? (
          <img src={value} alt={`${label} preview`} width={56} height={56} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span aria-hidden="true" style={{ color: "var(--muted, #889)", fontSize: "0.7rem" }}>none</span>
        )}
      </div>

      {/* Controls */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text, #111)" }}>{label}</div>
        <div className="body" style={{ fontSize: "0.72rem", color: "var(--muted, #778)", margin: "0.1rem 0 0.45rem" }}>{hint}</div>

        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          {kind === "icon" && (
            <GlassButton type="button" variant="ghost" onClick={() => setPicking(true)} disabled={busy}
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.7rem" }}>
              Choose icon
            </GlassButton>
          )}
          <GlassButton type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}
            aria-busy={busy} style={{ fontSize: "0.8rem", padding: "0.35rem 0.7rem" }}>
            {busy ? "Uploading…" : "Upload"}
          </GlassButton>
          {value && (
            <GlassButton type="button" variant="ghost" onClick={() => onChange("")} disabled={busy}
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.7rem" }}>
              Remove
            </GlassButton>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          onChange={handleFile}
          style={{ display: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        />

        {error && (
          <p id={errorId} role="alert" className="body" style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "#c0392b" }}>
            {error}
          </p>
        )}
      </div>

      {picking && <IconPicker onPick={handlePick} onClose={() => setPicking(false)} />}
    </div>
  );
}

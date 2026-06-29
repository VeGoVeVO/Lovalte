import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DynamicIcon } from "lucide-react/dynamic";
import { useUploadImage, fileToDataUrl, validateImageFile } from "./useImages";
import { useT } from "../../lib/i18n";
import type { CardDoc, Slot } from "./cardDoc";
import { hexToRgb } from "./cardDoc";
import { stampLayout, STRIP_RATIO, GRID_LEFT } from "./stampStrip";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";

/** Every editable component on the card. Clicking one selects + opens its editor. */
export type SlotKind =
  "logo" | "name" | "colors" | "hero" | "stamps" | "primary" | "header" | "fields" | "back" | null;

interface Props {
  doc: CardDoc;
  selected?: SlotKind;
  /** Select a component to edit; `anchor` is the clicked element the popover attaches to. */
  onSelect?: (s: SlotKind, anchor?: HTMLElement | null) => void;
  /** dispatch a builder tool (image.set / image.move). */
  dispatch?: (toolId: string, args?: Record<string, unknown>) => void;
  width?: number;
  /** Display-only (template gallery): no upload / drag / selection. */
  readOnly?: boolean;
}

const sampleValue = (doc: CardDoc) => {
  if (doc.type === "cashback") return "$5.25";
  return "120";
};

/** One editable image slot: empty -> click to upload; filled -> drag to reposition. */
function ImgSlot({
  slot,
  src,
  tx,
  ty,
  scale,
  art,
  height,
  round,
  active,
  label,
  editable,
  onSelect,
  dispatch,
}: {
  slot: Slot;
  src: string | null;
  tx: number;
  ty: number;
  scale: number;
  art?: string;
  height: number;
  round?: number;
  active: boolean;
  label: string;
  editable: boolean;
  onSelect: (anchor: HTMLElement) => void;
  dispatch: (toolId: string, args?: Record<string, unknown>) => void;
}) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const upload = useUploadImage();
  const [err, setErr] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setErr(invalid);
      return;
    }
    setErr(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await upload.mutateAsync({
        kind: slot === "logo" ? "logo" : "strip",
        source: "upload",
        dataUrl,
      });
      dispatch("image.set", { slot, src: res.url });
    } catch (e) {
      setErr((e as { message?: string })?.message ?? t("Upload failed."));
    }
  };
  const down = (e: React.PointerEvent) => {
    if (!src) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) / 120;
    const dy = (e.clientY - drag.current.y) / 120;
    dispatch("image.move", {
      slot,
      tx: Math.max(-1, Math.min(1, drag.current.tx + dx)),
      ty: Math.max(-1, Math.min(1, drag.current.ty + dy)),
    });
  };

  const interactive = editable
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": src ? t("Move {label}", { label }) : t("Add {label}", { label }),
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelect(e.currentTarget as HTMLElement);
          if (!src) inputRef.current?.click();
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          if ((e.key === "Enter" || e.key === " ") && !src) inputRef.current?.click();
        },
        onPointerDown: down,
        onPointerMove: move,
        onPointerUp: () => (drag.current = null),
      }
    : {};

  return (
    <div
      {...interactive}
      style={{
        position: "relative",
        height,
        borderRadius: round ?? 0,
        overflow: "hidden",
        cursor: editable ? (src ? "grab" : "pointer") : "default",
        outline: active ? "2.5px solid #3a86ff" : "none",
        outlineOffset: round ? 1 : -2,
        background: art ?? "rgba(255,255,255,.08)",
        touchAction: editable ? "none" : "auto",
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `translate(${tx * 18}%, ${ty * 18}%) scale(${scale})`,
          }}
        />
      ) : editable ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            border: "1.5px dashed rgba(255,255,255,.5)",
            borderRadius: round ?? 0,
            color: "rgba(255,255,255,.85)",
            fontSize: round ? 16 : 12,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: round ? 18 : 20 }}>{upload.isPending ? "…" : "＋"}</span>
          {!round && <span>{label}</span>}
        </div>
      ) : null}
      {src && active && (
        <div
          style={{
            position: "absolute",
            right: 6,
            bottom: 6,
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
            background: "rgba(0,0,0,.45)",
            padding: "2px 7px",
            borderRadius: 20,
          }}
        >
          {t("drag to fit")}
        </div>
      )}
      {err && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(120,20,20,.8)",
            color: "#fff",
            fontSize: 10,
            padding: 6,
            textAlign: "center",
          }}
        >
          {err}
        </div>
      )}
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
          style={{ display: "none" }}
          tabIndex={-1}
        />
      )}
    </div>
  );
}

/** "rgb(r, g, b)" -> "rgba(r, g, b, a)" for faint marks/rings. */
const fade = (rgb: string, a: number) => rgb.replace("rgb(", "rgba(").replace(")", `, ${a})`);

/**
 * The stamp grid on the strip band — every empty slot shows the chosen icon faint
 * and every earned slot a filled disc with the icon knocked out (highlighted), so
 * a fresh card reads as "coffee x N". Same layout (stampLayout) as the baked frames.
 */
function StampGrid({
  doc,
  fg,
  bg,
  width,
}: {
  doc: CardDoc;
  fg: string;
  bg: string;
  width: number;
}) {
  const { cols, rows } = stampLayout(doc.stampsGoal);
  const dot = Math.max(16, Math.round(((width * (1 - GRID_LEFT)) / cols) * 0.62));
  const icon = Math.round(dot * 0.62);
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: "14%",
        bottom: "14%",
        left: `${GRID_LEFT * 100}%`,
        right: "4%",
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: "6%",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: doc.stampsGoal }).map((_, i) => {
        const got = i < doc.stampsEarned;
        const art = got ? doc.stampedRef : doc.unstampedRef;
        if (art) {
          return (
            <img
              key={i}
              src={art}
              alt=""
              style={{ width: dot, height: dot, objectFit: "contain" }}
            />
          );
        }
        if (got) {
          return (
            <div
              key={i}
              style={{
                width: dot,
                height: dot,
                borderRadius: "50%",
                background: fg,
                display: "grid",
                placeItems: "center",
              }}
            >
              <DynamicIcon name={doc.stampIcon as never} size={icon} color={bg} />
            </div>
          );
        }
        return (
          <DynamicIcon
            key={i}
            name={doc.stampIcon as never}
            size={Math.round(dot * 0.85)}
            color={fade(fg, 0.4)}
          />
        );
      })}
    </div>
  );
}

const NOOP = () => {};

/** The interactive 1:1 Wallet card the merchant edits by clicking its parts. */
export function CardCanvas({
  doc,
  selected = null,
  onSelect = NOOP,
  dispatch = NOOP,
  width = 360,
  readOnly = false,
}: Props) {
  const { t } = useT();
  const editable = !readOnly;
  const fg = hexToRgb(doc.theme.fg);
  const bg = hexToRgb(doc.theme.bg);
  const lbl = hexToRgb(doc.theme.label);
  const brand = doc.logoText.trim() || t("Your Business");
  const labelStyle: CSSProperties = {
    fontSize: 9.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: lbl,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  /** A clickable, highlight-on-select region of the card. */
  const Region = ({
    kind,
    children,
    style,
    label,
  }: {
    kind: Exclude<SlotKind, null>;
    children: ReactNode;
    style?: CSSProperties;
    label: string;
  }) => {
    if (!editable) return <div style={style}>{children}</div>;
    const on = selected === kind;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={t("Edit {label}", { label })}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(kind, e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(kind, e.currentTarget);
          }
        }}
        style={{
          cursor: "pointer",
          borderRadius: 8,
          outline: on ? "2.5px solid #3a86ff" : "none",
          outlineOffset: 3,
          ...style,
        }}
      >
        {children}
      </div>
    );
  };

  const fieldChip = (label: string, value: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...labelStyle, fontSize: 9 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <div
      onClick={(e) => editable && onSelect("colors", e.currentTarget)}
      style={{
        width: "100%",
        maxWidth: width,
        minHeight: width * 1.34,
        display: "flex",
        flexDirection: "column",
        background: bg,
        color: fg,
        borderRadius: 18,
        overflow: "hidden",
        fontFamily: FONT,
        userSelect: "none",
        boxShadow:
          "0 1px 0 rgba(255,255,255,.12) inset, 0 30px 70px -28px rgba(0,0,0,.6), 0 10px 26px -12px rgba(0,0,0,.45)",
        transition: "background .35s ease",
      }}
    >
      {/* Header: logo + business name + header fields (top-right, max 3) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px 11px" }}>
        <div style={{ width: 34, height: 34, flexShrink: 0 }}>
          <ImgSlot
            slot="logo"
            src={doc.logo?.src ?? null}
            tx={doc.logo?.tx ?? 0}
            ty={doc.logo?.ty ?? 0}
            scale={doc.logo?.scale ?? 1}
            height={34}
            round={9}
            active={selected === "logo"}
            label={t("Logo")}
            editable={editable}
            onSelect={(el) => onSelect("logo", el)}
            dispatch={dispatch}
          />
        </div>
        <Region kind="name" label={t("Business name")} style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 15,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brand}
          </span>
        </Region>
        <Region kind="header" label={t("Header fields")} style={{ flexShrink: 0 }}>
          {doc.headerFields.length > 0 ? (
            <div style={{ display: "flex", gap: 12, textAlign: "right" }}>
              {doc.headerFields.slice(0, 3).map((f) => (
                <div key={f.id}>
                  <div style={labelStyle}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{f.value}</div>
                </div>
              ))}
            </div>
          ) : (
            editable && <span style={{ ...labelStyle, opacity: 0.55 }}>＋ {t("Header")}</span>
          )}
        </Region>
      </div>

      {/* Strip: stamp grid (with the "X / N" value) OR hero photo */}
      {doc.type === "stamps" ? (
        <Region kind="stamps" label={t("Stamps")} style={{ borderRadius: 0 }}>
          <div
            style={{
              position: "relative",
              height: width * STRIP_RATIO,
              background: bg,
              overflow: "hidden",
            }}
          >
            {doc.hero?.src && (
              <img
                src={doc.hero.src}
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            )}
            <StampGrid doc={doc} fg={fg} bg={bg} width={width} />
            <div
              style={{
                position: "absolute",
                left: 16,
                top: 0,
                bottom: 0,
                width: `${GRID_LEFT * 100}%`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                textShadow: doc.hero?.src ? "0 1px 6px rgba(0,0,0,.55)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {doc.stampsEarned} / {doc.stampsGoal}
              </div>
              <div style={{ ...labelStyle, fontSize: 11, marginTop: 3 }}>
                {doc.primaryLabel || "STAMPS"}
              </div>
            </div>
          </div>
        </Region>
      ) : (
        <ImgSlot
          slot="hero"
          src={doc.hero?.src ?? null}
          tx={doc.hero?.tx ?? 0}
          ty={doc.hero?.ty ?? 0}
          scale={doc.hero?.scale ?? 1}
          art="linear-gradient(120deg,#2a2d3a,#11131b)"
          height={width * 0.42}
          active={selected === "hero"}
          label={t("Hero photo")}
          editable={editable}
          onSelect={(el) => onSelect("hero", el)}
          dispatch={dispatch}
        />
      )}

      {/* Primary value (non-stamps) */}
      {doc.type !== "stamps" && (
        <Region kind="primary" label={t("Primary field")} style={{ margin: "10px 16px 0" }}>
          <div style={labelStyle}>{doc.primaryLabel}</div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              lineHeight: 1,
              marginTop: 3,
              letterSpacing: "-0.02em",
            }}
          >
            {sampleValue(doc)}
          </div>
        </Region>
      )}

      {/* Secondary fields row (all card types) */}
      <Region kind="fields" label={t("Fields")} style={{ margin: "10px 16px 0" }}>
        {doc.fields.length > 0 ? (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {doc.fields.slice(0, 4).map((f) => (
              <div key={f.id}>{fieldChip(f.label, f.value)}</div>
            ))}
          </div>
        ) : (
          editable && <span style={{ ...labelStyle, opacity: 0.55 }}>＋ {t("Add field")}</span>
        )}
      </Region>

      <div style={{ flex: 1, minHeight: 10 }} />

      {/* Back-of-card fields affordance */}
      {editable && (
        <Region kind="back" label={t("Back of card")} style={{ margin: "0 16px 4px" }}>
          <span style={{ ...labelStyle, opacity: 0.55 }}>
            ⓘ{" "}
            {doc.backFields.length > 0
              ? t("Back ({n})", { n: doc.backFields.length })
              : t("Back of card")}
          </span>
        </Region>
      )}

      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
        <div style={{ background: "#fff", padding: 9, borderRadius: 8, lineHeight: 0 }}>
          <QRCodeSVG
            value="LVT-000120"
            size={width * 0.34}
            bgColor="#ffffff"
            fgColor="#0b0b0b"
            level="M"
          />
        </div>
      </div>
    </div>
  );
}

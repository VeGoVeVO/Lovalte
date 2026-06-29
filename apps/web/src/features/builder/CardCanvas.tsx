import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { DynamicIcon } from "lucide-react/dynamic";
import { ColorPicker } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import type { CardDoc, Slot, FieldList } from "./cardDoc";
import type { PopAnchor } from "./CardPopover";
import { hexToRgb } from "./cardDoc";
import { stampLayout, STRIP_RATIO, GRID_LEFT } from "./stampStrip";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";

/** Components that open a contextual popover (text is edited inline instead). */
export type SlotKind = "logo" | "colors" | "hero" | "stamps" | "reward" | "back" | null;

/**
 * Popover anchors as STATIC rect snapshots (not live elements). The card's inner
 * `Region` is recreated on every render, so a captured element detaches when the
 * popover-opening re-render runs and its rect collapses to (0,0) → popover flew to
 * the top-left corner. Snapshotting the rect (or click point) at the moment of the
 * click is immune to that remount.
 */
const rectAnchor = (el: HTMLElement): PopAnchor => {
  const r = el.getBoundingClientRect();
  return { getBoundingClientRect: () => r };
};
const pointAnchor = (x: number, y: number): PopAnchor => ({
  getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
});

interface Props {
  doc: CardDoc;
  selected?: SlotKind;
  onSelect?: (s: SlotKind, anchor?: PopAnchor) => void;
  dispatch?: (toolId: string, args?: Record<string, unknown>) => void;
  width?: number;
  readOnly?: boolean;
  /** Open the OS file picker to add the (optional) logo, anchored at the "+" mark. */
  onAddLogo?: (rect?: DOMRect) => void;
}

const sampleValue = (doc: CardDoc) => (doc.type === "cashback" ? "$5.25" : "120");

/**
 * Inline-editable text drawn directly on the card. Uncontrolled contentEditable
 * (no cursor jumps): the DOM is only re-synced from `value` when the element is
 * NOT focused (undo/redo/template swaps), never mid-typing.
 */
function Editable({
  value,
  ph,
  ariaLabel,
  onInput,
  style,
  colorRole,
  onColorFocus,
  onColorBlur,
}: {
  value: string;
  ph?: string;
  ariaLabel: string;
  onInput: (v: string) => void;
  style?: CSSProperties;
  /** Which theme colour this text uses — drives the contextual recolour swatch. */
  colorRole?: "fg" | "label";
  onColorFocus?: (role: "fg" | "label", el: HTMLElement) => void;
  onColorBlur?: () => void;
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
      data-ph={ph}
      onInput={(e) => onInput(e.currentTarget.textContent || "")}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => colorRole && onColorFocus?.(colorRole, e.currentTarget)}
      onBlur={() => onColorBlur?.()}
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

/** One image slot: click opens its popover (upload/scale); filled -> drag to reposition. */
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
  onSelect: (anchor: PopAnchor) => void;
  dispatch: (toolId: string, args?: Record<string, unknown>) => void;
}) {
  const { t } = useT();
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(
    null,
  );

  const down = (e: React.PointerEvent) => {
    if (!src) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) / 120;
    const dy = (e.clientY - drag.current.y) / 120;
    if (Math.abs(dx) + Math.abs(dy) > 0.02) drag.current.moved = true;
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
          if (drag.current?.moved) return; // a drag, not a click
          onSelect(rectAnchor(e.currentTarget as HTMLElement));
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(rectAnchor(e.currentTarget as HTMLElement));
          }
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
        outline: active ? "2.5px solid #5BA7C9" : "none",
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
          <span style={{ fontSize: round ? 18 : 20 }}>＋</span>
          {!round && <span>{label}</span>}
        </div>
      ) : null}
    </div>
  );
}

/** "rgb(r, g, b)" -> "rgba(r, g, b, a)" for faint marks. */
const fade = (rgb: string, a: number) => rgb.replace("rgb(", "rgba(").replace(")", `, ${a})`);

/** Stamp grid: empty = chosen icon faint; earned = filled disc with icon knocked out. */
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
  // Size each mark from the ACTUAL cell (matches the baked strip): the cells abut
  // and the mark is 72% of the smaller cell side, so more stamps simply render
  // smaller and always fit the thin band — no overflow at 10 columns.
  const gridW = width * (1 - GRID_LEFT - 0.04); // left GRID_LEFT + right 4% margins
  const gridH = width * STRIP_RATIO * 0.72; // 14% top + 14% bottom reserved
  const dot = Math.max(10, Math.floor(Math.min(gridW / cols, gridH / rows) * 0.72));
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
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: doc.stampsGoal }).map((_, i) => {
        const got = i < doc.stampsEarned;
        const art = got ? doc.stampedRef : doc.unstampedRef;
        if (art)
          return (
            <img
              key={i}
              src={art}
              alt=""
              style={{ width: dot, height: dot, objectFit: "contain" }}
            />
          );
        if (got)
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

/** The interactive 1:1 Wallet card. Text edits inline; other parts open popovers. */
export function CardCanvas({
  doc,
  selected = null,
  onSelect = NOOP,
  dispatch = NOOP,
  width = 340,
  readOnly = false,
  onAddLogo = NOOP,
}: Props) {
  const { t } = useT();
  const editable = !readOnly;

  // Contextual recolour: focusing a text shows a small swatch near it (NOT the wheel
  // directly). Tapping the swatch opens the wheel for that text's theme colour.
  const [colorChip, setColorChip] = useState<{ role: "fg" | "label"; x: number; y: number } | null>(
    null,
  );
  const wheelOpen = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const colorProps = (role: "fg" | "label") => ({
    colorRole: role,
    onColorFocus: (r: "fg" | "label", el: HTMLElement) => {
      clearTimeout(blurTimer.current);
      const rc = el.getBoundingClientRect();
      setColorChip({ role: r, x: rc.left, y: rc.top });
    },
    onColorBlur: () => {
      blurTimer.current = setTimeout(() => {
        if (!wheelOpen.current) setColorChip(null);
      }, 200);
    },
  });

  const fg = hexToRgb(doc.theme.fg);
  const bg = hexToRgb(doc.theme.bg);
  const lbl = hexToRgb(doc.theme.label);
  const labelStyle: CSSProperties = {
    fontSize: 9.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: lbl,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  /** Clickable region that opens a popover and highlights when selected. */
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
          borderRadius: 8,
          outline: selected === kind ? "2.5px solid #5BA7C9" : "none",
          outlineOffset: 3,
          ...style,
        }}
      >
        {children}
      </div>
    );
  };

  const removeBtn = (list: FieldList, id: string) =>
    editable && (
      <button
        type="button"
        aria-label={t("Remove")}
        onClick={(e) => {
          e.stopPropagation();
          dispatch("field.remove", { list, id });
        }}
        style={{
          border: 0,
          background: "rgba(0,0,0,.28)",
          color: "#fff",
          width: 15,
          height: 15,
          borderRadius: "50%",
          fontSize: 10,
          lineHeight: 0,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    );

  const addBtn = (list: FieldList, label: string) =>
    editable && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dispatch("field.add", { list });
        }}
        style={{
          ...labelStyle,
          color: lbl,
          opacity: 0.65,
          border: "1px dashed currentColor",
          borderRadius: 6,
          background: "none",
          cursor: "pointer",
          padding: "3px 7px",
        }}
      >
        ＋ {label}
      </button>
    );

  return (
    <div
      onClick={(e) => {
        if (!editable) return;
        // Colours = the whole card; anchor to the click POINT so the popover opens
        // next to the cursor instead of beside the (huge) card element.
        onSelect("colors", pointAnchor(e.clientX, e.clientY));
      }}
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
        userSelect: editable ? "none" : "auto",
        boxShadow:
          "0 1px 0 rgba(255,255,255,.12) inset, 0 30px 70px -28px rgba(0,0,0,.6), 0 10px 26px -12px rgba(0,0,0,.45)",
        transition: "background .35s ease",
      }}
    >
      {/* Header: logo + name + header fields */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px 11px" }}>
        <div style={{ width: 34, height: 34, flexShrink: 0 }}>
          {editable && !doc.logo?.src ? (
            <button
              type="button"
              aria-label={t("Add logo")}
              onClick={(e) => onAddLogo(e.currentTarget.getBoundingClientRect())}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                cursor: "pointer",
                padding: 0,
                border: "1.5px dashed rgba(255,255,255,.5)",
                background: "rgba(255,255,255,.08)",
                color: "rgba(255,255,255,.85)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <DynamicIcon name={"image-plus" as never} size={16} />
            </button>
          ) : (
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
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editable ? (
            <Editable
              value={doc.logoText}
              ph={t("Business name")}
              ariaLabel={t("Business name")}
              onInput={(v) => dispatch("text.logoText", { value: v })}
              {...colorProps("fg")}
              style={{ display: "block", fontSize: 15, fontWeight: 700 }}
            />
          ) : (
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
              {doc.logoText || t("Your Business")}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            flexShrink: 0,
            textAlign: "right",
          }}
        >
          {doc.headerFields.slice(0, 3).map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 3 }}>
              <div>
                <Editable
                  value={f.label}
                  ph={t("Label")}
                  ariaLabel={t("Label")}
                  onInput={(v) =>
                    dispatch("field.set", {
                      list: "headerFields",
                      id: f.id,
                      key: "label",
                      value: v,
                    })
                  }
                  {...colorProps("label")}
                  style={{ ...labelStyle, display: "block" }}
                />
                <Editable
                  value={f.value}
                  ph={t("Value")}
                  ariaLabel={t("Value")}
                  onInput={(v) =>
                    dispatch("field.set", {
                      list: "headerFields",
                      id: f.id,
                      key: "value",
                      value: v,
                    })
                  }
                  {...colorProps("fg")}
                  style={{ display: "block", fontSize: 13, fontWeight: 600 }}
                />
              </div>
              {removeBtn("headerFields", f.id)}
            </div>
          ))}
          {doc.headerFields.length < 3 && addBtn("headerFields", t("Header"))}
        </div>
      </div>

      {/* Strip: stamps (count -> reward popover, grid -> stamps popover) OR hero */}
      {doc.type === "stamps" ? (
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
          <Region
            kind="stamps"
            label={t("Stamps")}
            style={{ position: "absolute", inset: 0, borderRadius: 0 }}
          >
            <StampGrid doc={doc} fg={fg} bg={bg} width={width} />
          </Region>
        </div>
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
        <div style={{ margin: "10px 16px 0" }}>
          <Editable
            value={doc.primaryLabel}
            ph="POINTS"
            ariaLabel={t("Label")}
            onInput={(v) => dispatch("text.primaryLabel", { value: v })}
            {...colorProps("label")}
            style={{ ...labelStyle, display: "block" }}
          />
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              lineHeight: 1,
              marginTop: 3,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {sampleValue(doc)}
          </div>
        </div>
      )}

      {/* Secondary fields row */}
      <div
        style={{
          margin: "12px 16px 0",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {/* Stamps: the "X / N" count is the first field (far left) — label is
            edited inline, the value opens the reward popover to change the goal. */}
        {doc.type === "stamps" && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 3, minWidth: 0 }}>
            <div>
              <Editable
                value={doc.primaryLabel}
                ph="STAMPS"
                ariaLabel={t("Label")}
                onInput={(v) => dispatch("text.primaryLabel", { value: v })}
                {...colorProps("label")}
                style={{ ...labelStyle, fontSize: 9, display: "block" }}
              />
              <Region
                kind="reward"
                label={t("Reward")}
                style={{ display: "inline-block", marginTop: 2 }}
              >
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {doc.stampsEarned} / {doc.stampsGoal}
                </span>
              </Region>
            </div>
          </div>
        )}
        {doc.fields.slice(0, doc.type === "stamps" ? 3 : 4).map((f) => (
          <div
            key={f.id}
            style={{ display: "flex", alignItems: "flex-start", gap: 3, minWidth: 0 }}
          >
            <div>
              <Editable
                value={f.label}
                ph={t("Label")}
                ariaLabel={t("Label")}
                onInput={(v) =>
                  dispatch("field.set", { list: "fields", id: f.id, key: "label", value: v })
                }
                {...colorProps("label")}
                style={{ ...labelStyle, fontSize: 9, display: "block" }}
              />
              <Editable
                value={f.value}
                ph={t("Value")}
                ariaLabel={t("Value")}
                onInput={(v) =>
                  dispatch("field.set", { list: "fields", id: f.id, key: "value", value: v })
                }
                {...colorProps("fg")}
                style={{ display: "block", fontSize: 14, fontWeight: 700, marginTop: 2 }}
              />
            </div>
            {removeBtn("fields", f.id)}
          </div>
        ))}
        {doc.fields.length < (doc.type === "stamps" ? 3 : 4) && addBtn("fields", t("Add field"))}
      </div>

      <div style={{ flex: 1, minHeight: 10 }} />

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
      {editable &&
        colorChip &&
        createPortal(
          <div
            className="lvt-tc-chip"
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "fixed",
              left: Math.min(Math.max(8, colorChip.x), window.innerWidth - 160),
              top: Math.max(8, colorChip.y - 46),
              zIndex: 2400,
              width: 150,
            }}
          >
            <ColorPicker
              ariaLabel={colorChip.role === "fg" ? t("Text colour") : t("Label colour")}
              value={colorChip.role === "fg" ? doc.theme.fg : doc.theme.label}
              onChange={(v) => dispatch("theme.set", { key: colorChip.role, value: v })}
              onOpenChange={(o) => {
                if (!o && wheelOpen.current) setColorChip(null);
                wheelOpen.current = o;
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

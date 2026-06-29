import { useEffect, useRef, useState } from "react";
import { DynamicIcon } from "lucide-react/dynamic";
import { Modal, GlassButton, ColorPicker } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import {
  useCreateTemplate,
  useUpdateTemplate,
  usePublishTemplate,
  useRegisterAsset,
  type CardTemplateDTO,
} from "./useTemplates";
import {
  TEMPLATES,
  TYPE_META,
  LOYALTY_KEYS,
  TOOLS,
  FIELD_CAPS,
  applyTool,
  initialDoc,
  docToInput,
  docFromTemplate,
  hexToRgb,
  type CardDoc,
  type FieldList,
} from "./cardDoc";
import type { LoyaltyType } from "./useTemplates";
import { CardCanvas, type SlotKind } from "./CardCanvas";
import { CardPopover } from "./CardPopover";
import { AssetField } from "./AssetField";
import { IconPicker } from "./IconPicker";
import { useUploadImage } from "./useImages";
import { renderStampFrames } from "./stampStrip";
import { svgToPngDataUrl } from "./lucideRaster";

type Step = "type" | "templates" | "editor";

type Dispatch = (toolId: string, args?: Record<string, unknown>) => void;

/** Popover heading per selected component (text is edited inline on the card). */
const TITLES: Record<Exclude<SlotKind, null>, string> = {
  logo: "Logo",
  colors: "Colours",
  hero: "Strip photo",
  stamps: "Stamps",
  reward: "Reward",
  back: "Back of the card",
};

/** A tiny branded square used as the auto Apple icon when no logo was uploaded. */
function makeIconDataUrl(bg: string, fg: string, name: string): string {
  const c = document.createElement("canvas");
  c.width = 174;
  c.height = 174;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 174, 174);
  ctx.fillStyle = fg;
  ctx.font = "bold 96px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((name.trim()[0] || "L").toUpperCase(), 87, 98);
  return c.toDataURL("image/png");
}

const editorCss = `
.lvt-be-stage { width: 340px; max-width: 100%; margin: 0 auto; display:flex; flex-direction:column; align-items:center; }
.lvt-be-hint { margin:16px auto 0; max-width:18rem; text-align:center; color:var(--muted); font-size:.82rem; text-wrap:balance; }
.lvt-ed { outline:none; cursor:text; border-radius:4px; }
.lvt-ed:focus { box-shadow:0 0 0 2px rgba(58,134,255,.55); }
.lvt-ed[data-ph]:empty::before { content: attr(data-ph); opacity:.5; }
.lvt-be-rail { display:flex; gap:16px; overflow-x:auto; scroll-snap-type:x mandatory; padding:10px calc(50% - 130px) 18px;
  -webkit-overflow-scrolling:touch; }
.lvt-be-rail::-webkit-scrollbar{ display:none; }
.lvt-be-slide { flex:0 0 auto; scroll-snap-align:center; cursor:pointer; border:0; background:none; padding:0;
  transition:transform .2s; }
.lvt-be-slide:hover{ transform:translateY(-4px); }
.lvt-be-iconbtn{ width:38px; height:38px; border-radius:10px; border:1px solid rgba(20,24,40,.12); background:#fff;
  display:grid; place-items:center; }
.lvt-be-eyebrow{ font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:0 0 6px; display:block; }
.lvt-be-row{ display:flex; align-items:center; gap:10px; }
@media (prefers-reduced-motion:reduce){ .lvt-be-slide{ transition:none; } }
`;

interface Props {
  initial: "new" | CardTemplateDTO;
  onClose: () => void;
}

/**
 * Canvas card builder: pick a type, swipe a template, then edit the card by
 * clicking its parts — each opens a contextual popover next to that element.
 * Every change runs a named tool via dispatch(toolId, args) — the same entry
 * point a future AI builder uses (exposed on window.__builder).
 */
export function CardEditor({ initial, onClose }: Props) {
  const { t } = useT();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const publishMut = usePublishTemplate();
  const assetMut = useRegisterAsset();
  const uploadImg = useUploadImage();
  // Hidden live render of the chosen stamp icon — rasterized into the strip frames.
  const stampIconRef = useRef<HTMLSpanElement>(null);

  const existing = initial !== "new" ? initial : null;
  const [step, setStep] = useState<Step>(existing ? "editor" : "type");
  const [type, setType] = useState<LoyaltyType>(existing?.rewardRule.cardType ?? "points");
  const [hist, setHist] = useState<CardDoc[]>(existing ? [docFromTemplate(existing)] : []);
  const [idx, setIdx] = useState(existing ? 0 : -1);
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);
  const [sel, setSel] = useState<SlotKind>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [iconPicker, setIconPicker] = useState(false);
  const doc = hist[idx];

  const dispatch: Dispatch = (toolId, args = {}) => {
    setHist((h) => {
      const cur = h[idx];
      if (!cur) return h;
      return [...h.slice(0, idx + 1), applyTool(cur, toolId, args)];
    });
    setIdx((n) => n + 1);
  };
  const seed = (d: CardDoc) => {
    setHist([d]);
    setIdx(0);
  };
  const undo = () => setIdx((n) => Math.max(0, n - 1));
  const redo = () => setIdx((n) => Math.min(hist.length - 1, n + 1));
  const select = (s: SlotKind, el?: HTMLElement | null) => {
    setSel(s);
    setAnchor(el ?? null);
  };
  const closePop = () => {
    setSel(null);
    setAnchor(null);
  };

  // Expose the tool API so a future AI builder can drive the exact same build.
  useEffect(() => {
    (window as unknown as { __builder?: unknown }).__builder = {
      dispatch,
      getDoc: () => hist[idx],
      listTools: () => Object.keys(TOOLS),
    };
  });

  const pickTemplate = (tplId: string) => {
    const tpl = TEMPLATES[type].find((x) => x.id === tplId);
    if (!tpl) return;
    seed({ ...initialDoc(type), ...(tpl.apply as object) } as CardDoc);
    closePop();
    setStep("editor");
  };

  /**
   * Render one strip per stamps-earned count and upload them. The chosen icon is
   * rasterized in BOTH the foreground (faint, empty mark) and background (knocked
   * out of the filled, earned disc) colours; uploaded art overrides it.
   * ponytail: regenerates every frame on publish (goal ≤ 12 → ≤ 13 small PNGs).
   */
  const buildStampFrames = async (): Promise<string[] | undefined> => {
    if (!doc || doc.type !== "stamps") return undefined;
    const svg = stampIconRef.current?.querySelector("svg");
    const [stampIconFgPng, stampIconBgPng] = svg
      ? await Promise.all([
          svgToPngDataUrl(svg, 174, hexToRgb(doc.theme.fg)).catch(() => null),
          svgToPngDataUrl(svg, 174, hexToRgb(doc.theme.bg)).catch(() => null),
        ])
      : [null, null];
    const frames = await renderStampFrames({
      goal: doc.stampsGoal,
      bg: doc.theme.bg,
      fg: doc.theme.fg,
      bgRef: doc.hero?.src || null,
      stampIconFgPng,
      stampIconBgPng,
      stampedRef: doc.stampedRef || null,
      unstampedRef: doc.unstampedRef || null,
    });
    return Promise.all(
      frames.map((dataUrl) =>
        uploadImg.mutateAsync({ kind: "strip", source: "upload", dataUrl }).then((r) => r.url),
      ),
    );
  };

  const save = async (stampStripRefs?: string[]): Promise<string | null> => {
    if (!doc) return null;
    setStatus(null);
    try {
      const input = { ...docToInput(doc), ...(stampStripRefs ? { stampStripRefs } : {}) };
      let id = savedId;
      if (id) await updateMut.mutateAsync({ id, input });
      else {
        const tmpl = await createMut.mutateAsync(input);
        id = tmpl.id;
        setSavedId(id);
      }
      // Apple requires an icon. Auto-derive it: reuse the logo, else a branded square.
      let iconRef = doc.iconRef || doc.logo?.src || "";
      if (!iconRef) {
        const res = await uploadImg.mutateAsync({
          kind: "icon",
          source: "upload",
          dataUrl: makeIconDataUrl(doc.theme.bg, doc.theme.fg, doc.logoText),
        });
        iconRef = res.url;
      }
      const assets = [
        { kind: "icon" as const, ref: iconRef },
        { kind: "logo" as const, ref: doc.logo?.src ?? "" },
        { kind: "strip" as const, ref: doc.hero?.src ?? "" },
      ].filter((a) => a.ref);
      await Promise.all(
        assets.map((a) => assetMut.mutateAsync({ id: id!, kind: a.kind, ref: a.ref })),
      );
      setStatus(t("Draft saved."));
      return id;
    } catch (e) {
      setStatus((e as { message?: string })?.message ?? t("Save failed."));
      return null;
    }
  };
  const publish = async () => {
    try {
      const frames = await buildStampFrames();
      const id = await save(frames);
      if (!id) return;
      await publishMut.mutateAsync(id);
      setStatus(t("Published."));
      onClose();
    } catch (e) {
      setStatus((e as { message?: string })?.message ?? t("Publish failed."));
    }
  };

  const busy =
    createMut.isPending ||
    updateMut.isPending ||
    publishMut.isPending ||
    assetMut.isPending ||
    uploadImg.isPending;

  // ── Type step ──────────────────────────────────────────────────────────────
  if (step === "type") {
    return (
      <Modal onClose={onClose} labelledBy="be-type-title">
        <h2 id="be-type-title" className="cardt lvt-modal-title">
          <span className="lvt-modal-mark brand" aria-hidden="true">
            <DynamicIcon name={"sparkles" as never} size={18} />
          </span>
          {t("What kind of card?")}
        </h2>
        <p className="body" style={{ margin: 0, color: "var(--muted)" }}>
          {t("This sets how rewards work and which templates you'll see.")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {LOYALTY_KEYS.map((ty) => (
            <button
              key={ty}
              type="button"
              className="btn ghost"
              onClick={() => {
                setType(ty);
                setStep("templates");
              }}
              style={{
                textAlign: "left",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 22 }}>{TYPE_META[ty].icon}</span>
              <strong>{t(TYPE_META[ty].name)}</strong>
              <span className="body" style={{ fontSize: ".8rem", color: "var(--muted)" }}>
                {t(TYPE_META[ty].blurb)}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  // ── Template carousel ──────────────────────────────────────────────────────
  if (step === "templates") {
    return (
      <div>
        <style>{editorCss}</style>
        <div style={{ marginBottom: "0.75rem", display: "flex", gap: ".5rem" }}>
          <GlassButton type="button" variant="ghost" onClick={() => setStep("type")}>
            {t("← Type")}
          </GlassButton>
          <GlassButton type="button" variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </GlassButton>
        </div>
        <h2 className="cardt" style={{ textAlign: "center", margin: "0 0 2px" }}>
          {t("Choose a {type} template", { type: t(TYPE_META[type].name).toLowerCase() })}
        </h2>
        <p
          className="body"
          style={{ textAlign: "center", color: "var(--muted)", margin: "0 0 14px" }}
        >
          {t("Swipe and tap the one you like - you can change everything next.")}
        </p>
        <div className="lvt-be-rail">
          {TEMPLATES[type].map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="lvt-be-slide"
              aria-label={t("Use template {name}", { name: tpl.name })}
              onClick={() => pickTemplate(tpl.id)}
            >
              <CardCanvas
                doc={{ ...initialDoc(type), ...(tpl.apply as object) } as CardDoc}
                width={232}
                readOnly
              />
              <div style={{ textAlign: "center", fontWeight: 700, marginTop: 10 }}>{tpl.name}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  if (!doc) return null;
  return (
    <div>
      <style>{editorCss}</style>
      {doc.type === "stamps" && (
        <span
          ref={stampIconRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <DynamicIcon name={doc.stampIcon as never} size={174} />
        </span>
      )}
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <GlassButton type="button" variant="ghost" onClick={onClose}>
          {t("← Back")}
        </GlassButton>
        <div style={{ flex: 1 }} />
        <GlassButton type="button" variant="ghost" onClick={undo} disabled={idx <= 0}>
          ↶ {t("Undo")}
        </GlassButton>
        <GlassButton type="button" variant="ghost" onClick={redo} disabled={idx >= hist.length - 1}>
          ↷ {t("Redo")}
        </GlassButton>
        <GlassButton type="button" variant="ghost" onClick={() => void save()} disabled={busy}>
          {t("Save draft")}
        </GlassButton>
        <GlassButton type="button" onClick={() => void publish()} disabled={busy}>
          {t("Publish")}
        </GlassButton>
      </div>

      <div className="lvt-be-stage">
        <CardCanvas doc={doc} selected={sel} onSelect={select} dispatch={dispatch} width={340} />
        {!sel && <p className="lvt-be-hint">{t("Tap any part of the card to edit it.")}</p>}
        {status && (
          <p
            role="status"
            aria-live="polite"
            className="body"
            style={{
              textAlign: "center",
              marginTop: 10,
              color: /fail|error/i.test(status) ? "#c0392b" : "var(--text)",
            }}
          >
            {status}
          </p>
        )}
      </div>

      <CardPopover
        anchor={anchor}
        open={!!sel && !iconPicker}
        onClose={closePop}
        title={sel ? t(TITLES[sel]) : ""}
      >
        {sel && (
          <ComponentEditor
            doc={doc}
            sel={sel}
            dispatch={dispatch}
            onPickStampIcon={() => setIconPicker(true)}
          />
        )}
      </CardPopover>

      {iconPicker && (
        <IconPicker
          onClose={() => setIconPicker(false)}
          onPick={(_svg, name) => {
            dispatch("stamps.icon", { icon: name });
            setIconPicker(false);
          }}
        />
      )}
    </div>
  );
}

// ── Per-component editors ─────────────────────────────────────────────────────

function FieldListEditor({
  doc,
  list,
  dispatch,
}: {
  doc: CardDoc;
  list: FieldList;
  dispatch: Dispatch;
}) {
  const { t } = useT();
  const rows = doc[list];
  const cap = FIELD_CAPS[list];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
      {rows.map((f) => (
        <div key={f.id} style={{ display: "flex", gap: 6 }}>
          <input
            className="input"
            value={f.label}
            placeholder={t("Label")}
            onChange={(e) =>
              dispatch("field.set", { list, id: f.id, key: "label", value: e.target.value })
            }
            style={{ flex: 1, minWidth: 0 }}
          />
          <input
            className="input"
            value={f.value}
            placeholder={t("Value")}
            onChange={(e) =>
              dispatch("field.set", { list, id: f.id, key: "value", value: e.target.value })
            }
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            className="btn ghost"
            aria-label={t("Remove")}
            onClick={() => dispatch("field.remove", { list, id: f.id })}
          >
            ✕
          </button>
        </div>
      ))}
      {rows.length < cap ? (
        <button type="button" className="btn ghost" onClick={() => dispatch("field.add", { list })}>
          ＋ {t("Add field")}
        </button>
      ) : (
        <p className="body" style={{ fontSize: ".72rem", color: "var(--muted)", margin: 0 }}>
          {t("Maximum {n} reached.", { n: cap })}
        </p>
      )}
    </div>
  );
}

function ImageEditor({
  doc,
  slot,
  dispatch,
}: {
  doc: CardDoc;
  slot: "logo" | "hero";
  dispatch: Dispatch;
}) {
  const { t } = useT();
  const layer = doc[slot];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
      <AssetField
        kind={slot === "logo" ? "logo" : "strip"}
        label={slot === "logo" ? t("Logo") : t("Photo")}
        hint={slot === "logo" ? t("Top-left of the card.") : t("Banner behind the value.")}
        value={layer?.src ?? ""}
        onChange={(url) =>
          url ? dispatch("image.set", { slot, src: url }) : dispatch("image.clear", { slot })
        }
      />
      {layer && (
        <div>
          <label className="lvt-be-eyebrow">{t("Fit & zoom")}</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={layer.scale}
            onChange={(e) => dispatch("image.scale", { slot, scale: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
          <p className="body" style={{ fontSize: ".72rem", color: "var(--muted)", margin: 0 }}>
            {t("Drag the image on the card to reposition.")}
          </p>
        </div>
      )}
    </div>
  );
}

function ComponentEditor({
  doc,
  sel,
  dispatch,
  onPickStampIcon,
}: {
  doc: CardDoc;
  sel: Exclude<SlotKind, null>;
  dispatch: Dispatch;
  onPickStampIcon: () => void;
}) {
  const { t } = useT();

  if (sel === "colors") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
        <ColorPicker
          ariaLabel={t("Background")}
          value={doc.theme.bg}
          onChange={(v) => dispatch("theme.set", { key: "bg", value: v })}
        />
        <ColorPicker
          ariaLabel={t("Text")}
          value={doc.theme.fg}
          onChange={(v) => dispatch("theme.set", { key: "fg", value: v })}
        />
        <ColorPicker
          ariaLabel={t("Labels")}
          value={doc.theme.label}
          onChange={(v) => dispatch("theme.set", { key: "label", value: v })}
        />
      </div>
    );
  }

  if (sel === "logo") return <ImageEditor doc={doc} slot="logo" dispatch={dispatch} />;
  if (sel === "hero") return <ImageEditor doc={doc} slot="hero" dispatch={dispatch} />;
  if (sel === "back") return <FieldListEditor doc={doc} list="backFields" dispatch={dispatch} />;

  if (sel === "reward") {
    return (
      <div>
        <label className="lvt-be-eyebrow">{t("Stamps to reward")}</label>
        <div className="lvt-be-row">
          <button
            type="button"
            className="btn ghost"
            aria-label={t("Fewer")}
            onClick={() => dispatch("stamps.goal", { goal: doc.stampsGoal - 1 })}
          >
            −
          </button>
          <strong style={{ minWidth: 24, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {doc.stampsGoal}
          </strong>
          <button
            type="button"
            className="btn ghost"
            aria-label={t("More")}
            onClick={() => dispatch("stamps.goal", { goal: doc.stampsGoal + 1 })}
          >
            ＋
          </button>
        </div>
        <p
          className="body"
          style={{ fontSize: ".72rem", color: "var(--muted)", margin: "8px 0 0" }}
        >
          {t("Edit the label by typing on the card.")}
        </p>
      </div>
    );
  }

  // sel === "stamps" — the stamp look (icon + art + background)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 240 }}>
      <div>
        <label className="lvt-be-eyebrow">{t("Stamp icon")}</label>
        <div className="lvt-be-row">
          <span className="lvt-be-iconbtn">
            <DynamicIcon name={doc.stampIcon as never} size={20} />
          </span>
          <button type="button" className="btn ghost" onClick={onPickStampIcon}>
            {t("Choose icon")}
          </button>
        </div>
      </div>
      <div>
        <label className="lvt-be-eyebrow">{t("Background image (optional)")}</label>
        <AssetField
          kind="strip"
          label={t("Background")}
          hint={t("Fills the strip behind the stamps.")}
          value={doc.hero?.src ?? ""}
          onChange={(url) =>
            url
              ? dispatch("image.set", { slot: "hero", src: url })
              : dispatch("image.clear", { slot: "hero" })
          }
        />
      </div>
      <div>
        <label className="lvt-be-eyebrow">{t("Stamp art (optional)")}</label>
        <p
          className="body"
          style={{ fontSize: ".72rem", color: "var(--muted)", margin: "0 0 .5rem" }}
        >
          {t("Upload your own stamp images to replace the icon.")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AssetField
            kind="strip"
            label={t("Stamped")}
            hint={t("Shown for collected stamps.")}
            value={doc.stampedRef}
            onChange={(url) => dispatch("stamps.art", { slot: "stamped", ref: url })}
          />
          <AssetField
            kind="strip"
            label={t("Unstamped")}
            hint={t("Shown for empty stamps.")}
            value={doc.unstampedRef}
            onChange={(url) => dispatch("stamps.art", { slot: "unstamped", ref: url })}
          />
        </div>
      </div>
    </div>
  );
}

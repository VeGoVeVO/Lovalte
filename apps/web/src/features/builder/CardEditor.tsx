import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
import { GoogleCardCanvas, type GSlotKind } from "./GoogleCardCanvas";
import { GoogleComponentEditor } from "./GoogleComponentEditor";
import { CardPopover, type PopAnchor } from "./CardPopover";
import { AssetField } from "./AssetField";
import { IconPicker } from "./IconPicker";
import { useUploadImage, fileToDataUrl, validateImageFile } from "./useImages";
import { renderStampFrames } from "./stampStrip";
import { svgToPngDataUrl } from "./lucideRaster";

type Step = "type" | "templates" | "editor";

type Dispatch = (toolId: string, args?: Record<string, unknown>) => void;

/**
 * Per-component popover identity: a distinct icon, caption and accent so each
 * editor reads as its own designed surface (not one generic box). Text fields
 * are still edited inline on the card; the popover holds the non-text controls.
 */
const SLOT_META: Record<
  Exclude<SlotKind, null>,
  { icon: string; title: string; sub: string; accent: string }
> = {
  logo: { icon: "image", title: "Logo", sub: "Your brand mark, top-left", accent: "#3FB6D9" },
  colors: {
    icon: "palette",
    title: "Background",
    sub: "Pick the card background",
    accent: "#8B7BD8",
  },
  hero: { icon: "image", title: "Strip photo", sub: "Banner behind the value", accent: "#34B98A" },
  stamps: { icon: "stamp", title: "Stamps", sub: "Icon, art & background", accent: "#D96BA8" },
  reward: { icon: "gift", title: "Reward", sub: "Stamps needed to earn it", accent: "#E0954B" },
  back: {
    icon: "rotate-ccw",
    title: "Back of card",
    sub: "Details on the flip side",
    accent: "#6E86C8",
  },
};

const G_SLOT_META: Record<
  Exclude<GSlotKind, null>,
  { icon: string; title: string; sub: string; accent: string }
> = {
  logo:        { icon: "image",   title: "Google logo",   sub: "Brand mark & card title",   accent: "#4285F4" },
  colors:      { icon: "palette", title: "Background",    sub: "Google card colour",         accent: "#8B7BD8" },
  hero:        { icon: "image",   title: "Hero image",    sub: "Banner image at card top",   accent: "#34B98A" },
  textModules: { icon: "list",    title: "Text fields",   sub: "Rows shown on Google card",  accent: "#6E86C8" },
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
.lvt-be-bar { display:flex; align-items:center; gap:8px; margin-bottom:16px; }
/* Toolbar buttons = the Halo glass material (frosted, edge-lit, lifted). */
.lvt-be-tool { width:40px; height:40px; flex:0 0 auto; display:grid; place-items:center; border-radius:13px; line-height:0;
  border:1px solid rgba(255,255,255,.7); color:var(--text,#20242A);
  background:linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.6));
  -webkit-backdrop-filter:blur(18px) saturate(160%); backdrop-filter:blur(18px) saturate(160%);
  cursor:pointer; box-shadow:0 1px 0 rgba(255,255,255,.85) inset, 0 6px 16px -10px rgba(46,62,92,.4);
  transition:transform .12s ease, box-shadow .2s ease, border-color .2s ease; }
.lvt-be-tool:hover:not(:disabled){ transform:translateY(-1px); box-shadow:0 1px 0 rgba(255,255,255,.95) inset, 0 10px 22px -10px rgba(46,62,92,.5); border-color:rgba(169,245,255,.85); }
.lvt-be-tool:active:not(:disabled){ transform:translateY(0) scale(.93); }
.lvt-be-tool:disabled { opacity:.4; cursor:default; }
.lvt-be-tool:focus-visible { outline:none; box-shadow:0 0 0 4px rgba(169,245,255,.4); }
/* Publish = holographic CTA echoing the brand mark (cyan -> lavender -> pink). */
.lvt-be-publish { margin-left:auto; height:40px; padding:0 22px; border-radius:13px; border:0; font-weight:700; font-size:.94rem; cursor:pointer;
  color:#fff; letter-spacing:.005em; text-shadow:0 1px 2px rgba(24,12,48,.4);
  background:linear-gradient(135deg, #3E72C0 0%, #6B53C6 48%, #BE3F86 100%);
  box-shadow:0 1px 0 rgba(255,255,255,.4) inset, 0 10px 26px -10px rgba(107,83,198,.85), 0 2px 6px -2px rgba(190,63,134,.5);
  transition:transform .12s ease, box-shadow .2s ease, filter .2s ease; }
.lvt-be-publish:hover:not(:disabled){ transform:translateY(-1px); filter:saturate(1.08) brightness(1.04); box-shadow:0 1px 0 rgba(255,255,255,.5) inset, 0 14px 32px -10px rgba(107,83,198,.95), 0 3px 8px -2px rgba(190,63,134,.6); }
.lvt-be-publish:active:not(:disabled){ transform:translateY(0) scale(.97); }
.lvt-be-publish:disabled { opacity:.55; cursor:default; }
.lvt-be-publish:focus-visible { outline:none; box-shadow:0 0 0 4px rgba(139,123,216,.45); }
.lvt-be-dual-stage { display:flex; gap:24px; justify-content:center; align-items:flex-start; overflow-x:auto; flex-wrap:wrap; }
.lvt-be-platform-col { display:flex; flex-direction:column; align-items:center; gap:8px; }
.lvt-be-platform-label { font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
@media(max-width:700px){ .lvt-be-dual-stage { flex-direction:column; align-items:center; } }
.lvt-be-hint { margin:18px auto 0; max-width:18rem; text-align:center; color:var(--muted); font-size:.82rem; text-wrap:balance; }
.lvt-ed { outline:none; cursor:text; border-radius:5px; transition:box-shadow .15s ease; }
.lvt-ed:focus { box-shadow:0 0 0 2px rgba(169,245,255,.85); }
.lvt-ed[data-ph]:empty::before { content: attr(data-ph); opacity:.5; }
.lvt-be-rail { display:flex; gap:16px; overflow-x:auto; scroll-snap-type:x mandatory; padding:10px calc(50% - 130px) 18px;
  -webkit-overflow-scrolling:touch; }
.lvt-be-rail::-webkit-scrollbar{ display:none; }
.lvt-be-slide { flex:0 0 auto; scroll-snap-align:center; cursor:pointer; border:0; background:none; padding:0;
  transition:transform .22s var(--ease,cubic-bezier(.22,1,.36,1)); }
.lvt-be-slide:hover{ transform:translateY(-6px) scale(1.015); }
.lvt-be-iconbtn{ width:40px; height:40px; border-radius:11px; border:1px solid rgba(255,255,255,.7);
  background:linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.6)); color:var(--text,#20242A);
  -webkit-backdrop-filter:blur(14px) saturate(160%); backdrop-filter:blur(14px) saturate(160%);
  display:grid; place-items:center; box-shadow:0 1px 0 rgba(255,255,255,.85) inset; }
.lvt-be-eyebrow{ font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:0 0 6px; display:block; }
.lvt-be-row{ display:flex; align-items:center; gap:10px; }
@media (prefers-reduced-motion:reduce){ .lvt-be-slide, .lvt-be-tool, .lvt-be-publish, .lvt-ed{ transition:none; } }
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
  // Already-published cards are edited & re-pushed to holders, so the CTA reads "Update".
  const isPublished = existing?.status === "published";
  const [step, setStep] = useState<Step>(existing ? "editor" : "type");
  const [type, setType] = useState<LoyaltyType>(existing?.rewardRule.cardType ?? "points");
  const [hist, setHist] = useState<CardDoc[]>(existing ? [docFromTemplate(existing)] : []);
  const [idx, setIdx] = useState(existing ? 0 : -1);
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);
  const [sel, setSel] = useState<SlotKind>(null);
  const [gSel, setGSel] = useState<GSlotKind>(null);
  const [anchor, setAnchor] = useState<PopAnchor>(null);
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
  const select = (s: SlotKind, el?: PopAnchor) => {
    setSel(s);
    setAnchor(el ?? null);
  };
  const closePop = () => {
    setSel(null);
    setGSel(null);
    setAnchor(null);
  };

  // Logo = optional. The "+" mark on the card opens the OS file picker directly
  // (no popover); after upload the logo auto-fits and the adjust popover opens so
  // the merchant can nudge/scale it to fit if they want.
  const logoFileRef = useRef<HTMLInputElement>(null);
  const logoAnchorRect = useRef<DOMRect | null>(null);
  const addLogo = (rect?: DOMRect) => {
    logoAnchorRect.current = rect ?? null;
    logoFileRef.current?.click();
  };
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
      dispatch("image.set", { slot: "logo", src: res.url });
      const rect = logoAnchorRect.current;
      setSel("logo");
      setAnchor(rect ? { getBoundingClientRect: () => rect } : null);
    } catch (err) {
      setStatus((err as { message?: string })?.message ?? t("Upload failed."));
    }
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
      let assets = [
        { kind: "icon" as const, ref: iconRef },
        { kind: "logo" as const, ref: doc.logo?.src ?? "" },
        { kind: "strip" as const, ref: doc.hero?.src ?? "" },
      ].filter((a) => a.ref);
      if (doc.googleOverrides?.logoSrc && doc.googleOverrides.logoSrc !== doc.logo?.src)
        assets.push({ kind: "logo" as const, ref: doc.googleOverrides.logoSrc });
      if (doc.googleOverrides?.heroSrc && doc.googleOverrides.heroSrc !== doc.hero?.src)
        assets.push({ kind: "strip" as const, ref: doc.googleOverrides.heroSrc });
      // SEQUENTIAL, not Promise.all: each RegisterAssetRef does read-modify-write on
      // the same template config; running them in parallel races and only the last
      // ref survives (that's why the logo never reached the issued pass).
      for (const a of assets) {
        await assetMut.mutateAsync({ id: id!, kind: a.kind, ref: a.ref });
      }
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
      setStatus(isPublished ? t("Updated — holders will get the new card.") : t("Published."));
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
      <div className="lvt-be-bar">
        <button type="button" className="lvt-be-tool" aria-label={t("Back")} onClick={onClose}>
          <DynamicIcon name={"arrow-left" as never} size={18} />
        </button>
        <button
          type="button"
          className="lvt-be-tool"
          aria-label={t("Undo")}
          onClick={undo}
          disabled={idx <= 0}
        >
          <DynamicIcon name={"undo-2" as never} size={18} />
        </button>
        <button
          type="button"
          className="lvt-be-tool"
          aria-label={t("Redo")}
          onClick={redo}
          disabled={idx >= hist.length - 1}
        >
          <DynamicIcon name={"redo-2" as never} size={18} />
        </button>
        <button
          type="button"
          className="lvt-be-tool"
          aria-label={t("Save draft")}
          onClick={() => void save()}
          disabled={busy}
        >
          <DynamicIcon name={"save" as never} size={18} />
        </button>
        <button
          type="button"
          className="lvt-be-publish"
          onClick={() => void publish()}
          disabled={busy}
        >
          {isPublished ? t("Update") : t("Publish")}
        </button>
      </div>

      <input
        ref={logoFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={onLogoFile}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="lvt-be-dual-stage">
        <div className="lvt-be-platform-col">
          <span className="lvt-be-platform-label">{t("Apple Wallet")}</span>
          <CardCanvas
            doc={doc}
            selected={sel}
            onSelect={(s, el) => { setGSel(null); select(s, el); }}
            dispatch={dispatch}
            width={300}
            onAddLogo={addLogo}
          />
        </div>
        <div className="lvt-be-platform-col">
          <span className="lvt-be-platform-label">{t("Google Wallet")}</span>
          <GoogleCardCanvas
            doc={doc}
            selected={gSel}
            onSelect={(s, el) => { setSel(null); setGSel(s); setAnchor(el ?? null); }}
            dispatch={dispatch}
            width={300}
          />
        </div>
      </div>
      {!sel && !gSel && <p className="lvt-be-hint">{t("Tap any part of the card to edit it.")}</p>}
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

      <CardPopover
        anchor={anchor}
        open={(!!sel || !!gSel) && !iconPicker}
        onClose={closePop}
        title={
          sel ? t(SLOT_META[sel].title) :
          gSel ? t(G_SLOT_META[gSel].title) : ""
        }
        subtitle={
          sel ? t(SLOT_META[sel].sub) :
          gSel ? t(G_SLOT_META[gSel].sub) : undefined
        }
        accent={sel ? SLOT_META[sel].accent : gSel ? G_SLOT_META[gSel].accent : undefined}
        icon={
          sel ? <DynamicIcon name={SLOT_META[sel].icon as never} size={17} /> :
          gSel ? <DynamicIcon name={G_SLOT_META[gSel].icon as never} size={17} /> : undefined
        }
      >
        {sel && (
          <ComponentEditor
            doc={doc}
            sel={sel}
            dispatch={dispatch}
            onPickStampIcon={() => setIconPicker(true)}
            onAddLogo={addLogo}
          />
        )}
        {gSel && !sel && (
          <GoogleComponentEditor doc={doc} sel={gSel} dispatch={dispatch} />
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
            maxLength={50}
            onChange={(e) =>
              dispatch("field.set", { list, id: f.id, key: "label", value: e.target.value })
            }
            style={{ flex: 1, minWidth: 0 }}
          />
          <input
            className="input"
            value={f.value}
            placeholder={t("Value")}
            maxLength={255}
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
  onAddLogo,
}: {
  doc: CardDoc;
  sel: Exclude<SlotKind, null>;
  dispatch: Dispatch;
  onPickStampIcon: () => void;
  onAddLogo: (rect?: DOMRect) => void;
}) {
  const { t } = useT();

  if (sel === "colors") {
    // Clicking the card background edits ONLY the background colour, with the wheel
    // open straight away. Text & label colours are changed contextually, from the
    // little swatch that appears when you tap that text on the card.
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 248 }}>
        <ColorPicker
          ariaLabel={t("Background")}
          value={doc.theme.bg}
          onChange={(v) => dispatch("theme.set", { key: "bg", value: v })}
          defaultOpen
        />
      </div>
    );
  }

  if (sel === "logo") {
    // Logo is optional & uploaded directly from the card's "+" mark; here we only
    // fine-tune the fit (or replace/remove). No big upload field.
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
        {doc.logo ? (
          <>
            <div>
              <label className="lvt-be-eyebrow">{t("Fit & zoom")}</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={doc.logo.scale}
                onChange={(e) =>
                  dispatch("image.scale", { slot: "logo", scale: Number(e.target.value) })
                }
                style={{ width: "100%" }}
              />
              <p className="body" style={{ fontSize: ".72rem", color: "var(--muted)", margin: 0 }}>
                {t("Drag the logo on the card to reposition.")}
              </p>
            </div>
            <div className="lvt-be-row">
              <button type="button" className="btn ghost" onClick={() => onAddLogo()}>
                {t("Replace")}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => dispatch("image.clear", { slot: "logo" })}
              >
                {t("Remove")}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => onAddLogo()}>
            {t("Upload a logo")}
          </button>
        )}
      </div>
    );
  }
  if (sel === "hero") return <ImageEditor doc={doc} slot="hero" dispatch={dispatch} />;
  if (sel === "back") return <FieldListEditor doc={doc} list="backFields" dispatch={dispatch} />;

  if (sel === "reward") {
    return (
      <div style={{ minWidth: 230 }}>
        <label className="lvt-be-eyebrow">{t("Stamps to reward")}</label>
        <div className="lvt-pop-step" role="group" aria-label={t("Stamps to reward")}>
          <button
            type="button"
            aria-label={t("Fewer")}
            disabled={doc.stampsGoal <= 1}
            onClick={() => dispatch("stamps.goal", { goal: doc.stampsGoal - 1 })}
          >
            −
          </button>
          <span className="val" aria-live="polite">
            {doc.stampsGoal}
          </span>
          <button
            type="button"
            aria-label={t("More")}
            onClick={() => dispatch("stamps.goal", { goal: doc.stampsGoal + 1 })}
          >
            +
          </button>
        </div>
        <p
          className="body"
          style={{ fontSize: ".72rem", color: "var(--muted)", margin: "10px 0 0" }}
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
          <span className="lvt-pop-iconbtn">
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

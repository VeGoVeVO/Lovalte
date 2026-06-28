import { useEffect, useState } from "react";
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
  applyTool,
  initialDoc,
  docToInput,
  docFromTemplate,
  type CardDoc,
} from "./cardDoc";
import type { LoyaltyType } from "./useTemplates";
import { CardCanvas, type SlotKind } from "./CardCanvas";
import { AssetField } from "./AssetField";
import { IconPicker } from "./IconPicker";

type Step = "type" | "templates" | "editor";

const editorCss = `
.lvt-be-grid { display:grid; grid-template-columns: 1fr minmax(300px,340px); gap:18px; align-items:start; }
.lvt-be-canvas { display:flex; justify-content:center; padding:14px 0 26px; border-radius:22px;
  background:radial-gradient(50% 60% at 50% 0%,rgba(169,245,255,.22),transparent),rgba(255,255,255,.45); }
.lvt-be-rail { display:flex; gap:16px; overflow-x:auto; scroll-snap-type:x mandatory; padding:10px calc(50% - 130px) 18px;
  -webkit-overflow-scrolling:touch; }
.lvt-be-rail::-webkit-scrollbar{ display:none; }
.lvt-be-slide { flex:0 0 auto; scroll-snap-align:center; cursor:pointer; border:0; background:none; padding:0;
  transition:transform .2s; }
.lvt-be-slide:hover{ transform:translateY(-4px); }
.lvt-be-iconbtn{ width:38px; height:38px; border-radius:10px; border:1px solid rgba(20,24,40,.12); background:#fff;
  display:grid; place-items:center; cursor:pointer; }
.lvt-be-iconbtn.on{ border-color:#3a86ff; background:rgba(58,134,255,.1); color:#2563eb; }
@media (prefers-reduced-motion:reduce){ .lvt-be-slide{ transition:none; } }
@media (max-width:860px){ .lvt-be-grid{ grid-template-columns:1fr; } .lvt-be-preview{ position:static!important; order:-1; } }
`;

interface Props {
  initial: "new" | CardTemplateDTO;
  onClose: () => void;
}

/**
 * Canvas card builder: pick a type, swipe a template, then edit the card
 * directly. Every change runs a named tool via dispatch(toolId, args) - the same
 * entry point a future AI builder will call (exposed on window.__builder).
 */
export function CardEditor({ initial, onClose }: Props) {
  const { t } = useT();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const publishMut = usePublishTemplate();
  const assetMut = useRegisterAsset();

  const existing = initial !== "new" ? initial : null;
  const [step, setStep] = useState<Step>(existing ? "editor" : "type");
  const [type, setType] = useState<LoyaltyType>(existing?.rewardRule.cardType ?? "points");
  const [hist, setHist] = useState<CardDoc[]>(existing ? [docFromTemplate(existing)] : []);
  const [idx, setIdx] = useState(existing ? 0 : -1);
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);
  const [sel, setSel] = useState<SlotKind>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [iconPicker, setIconPicker] = useState(false);
  const doc = hist[idx];

  const dispatch = (toolId: string, args: Record<string, unknown> = {}) => {
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
    setSel(null);
    setStep("editor");
  };

  const save = async (): Promise<string | null> => {
    if (!doc) return null;
    setStatus(null);
    try {
      const input = docToInput(doc);
      let id = savedId;
      if (id) await updateMut.mutateAsync({ id, input });
      else {
        const tmpl = await createMut.mutateAsync(input);
        id = tmpl.id;
        setSavedId(id);
      }
      const assets = [
        { kind: "icon" as const, ref: doc.iconRef },
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
    const id = await save();
    if (!id) return;
    try {
      await publishMut.mutateAsync(id);
      setStatus(t("Published."));
      onClose();
    } catch (e) {
      setStatus((e as { message?: string })?.message ?? t("Publish failed."));
    }
  };

  const busy =
    createMut.isPending || updateMut.isPending || publishMut.isPending || assetMut.isPending;

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

      <div className="lvt-be-grid">
        <div className="lvt-be-canvas lvt-be-preview" style={{ position: "sticky", top: "6rem" }}>
          <CardCanvas doc={doc} selected={sel} onSelect={setSel} dispatch={dispatch} width={360} />
        </div>
        <div
          className="glass feature"
          style={{ padding: "1.1rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}
        >
          <Inspector
            doc={doc}
            sel={sel}
            dispatch={dispatch}
            onPickStampIcon={() => setIconPicker(true)}
          />
          {status && (
            <p
              role="status"
              aria-live="polite"
              className="body"
              style={{ color: /fail|error/i.test(status) ? "#c0392b" : "var(--text)", margin: 0 }}
            >
              {status}
            </p>
          )}
        </div>
      </div>

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

function Inspector({
  doc,
  sel,
  dispatch,
  onPickStampIcon,
}: {
  doc: CardDoc;
  sel: SlotKind;
  dispatch: (t: string, a?: Record<string, unknown>) => void;
  onPickStampIcon: () => void;
}) {
  const { t } = useT();
  const eyebrow = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".06em",
    textTransform: "uppercase" as const,
    color: "var(--muted)",
    margin: "0 0 6px",
  };

  if (sel === "logo" || sel === "hero") {
    const layer = doc[sel];
    return (
      <div>
        <p style={eyebrow}>
          {t("Editing {label}", { label: sel === "logo" ? t("Logo") : t("Hero photo") })}
        </p>
        <label style={eyebrow}>{t("Fit & zoom")}</label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={layer?.scale ?? 1}
          disabled={!layer}
          onChange={(e) => dispatch("image.scale", { slot: sel, scale: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
        <p className="body" style={{ fontSize: ".75rem", color: "var(--muted)" }}>
          {layer
            ? t("Drag the photo on the card to reposition.")
            : t("Click the slot on the card to add a photo.")}
        </p>
        {layer && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => dispatch("image.clear", { slot: sel })}
          >
            {t("Remove photo")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div>
        <label style={eyebrow}>{t("Business name")}</label>
        <input
          className="input"
          value={doc.business}
          onChange={(e) => dispatch("text.business", { value: e.target.value })}
        />
      </div>
      <div>
        <label style={eyebrow}>{t("Logo text")}</label>
        <input
          className="input"
          value={doc.logoText}
          maxLength={24}
          placeholder={t("e.g. LOYALTY")}
          onChange={(e) => dispatch("text.logoText", { value: e.target.value })}
        />
      </div>

      <div>
        <label style={eyebrow}>{t("Colors")}</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
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
      </div>

      {doc.type === "stamps" ? (
        <>
          <div>
            <label style={eyebrow}>{t("Stamp icon")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="lvt-be-iconbtn on">
                <DynamicIcon name={doc.stampIcon as never} size={20} />
              </span>
              <button type="button" className="btn ghost" onClick={onPickStampIcon}>
                {t("Choose icon")}
              </button>
            </div>
          </div>
          <div>
            <label style={eyebrow}>{t("Stamps to reward")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => dispatch("stamps.goal", { goal: doc.stampsGoal - 1 })}
              >
                −
              </button>
              <strong style={{ minWidth: 24, textAlign: "center" }}>{doc.stampsGoal}</strong>
              <button
                type="button"
                className="btn ghost"
                onClick={() => dispatch("stamps.goal", { goal: doc.stampsGoal + 1 })}
              >
                ＋
              </button>
            </div>
          </div>
        </>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={eyebrow}>{t("Fields")}</label>
            <button type="button" className="btn ghost" onClick={() => dispatch("field.add")}>
              ＋ {t("Add")}
            </button>
          </div>
          {doc.fields.map((fl) => (
            <div key={fl.id} style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input
                className="input"
                value={fl.label}
                onChange={(e) =>
                  dispatch("field.set", { id: fl.id, key: "label", value: e.target.value })
                }
                style={{ flex: 1 }}
              />
              <input
                className="input"
                value={fl.value}
                onChange={(e) =>
                  dispatch("field.set", { id: fl.id, key: "value", value: e.target.value })
                }
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn ghost"
                onClick={() => dispatch("field.remove", { id: fl.id })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <label style={eyebrow}>{t("App icon *")}</label>
        <AssetField
          kind="icon"
          label={t("Icon")}
          hint={t("Required to publish. Square, no transparency.")}
          value={doc.iconRef}
          iconColor={doc.theme.fg}
          onChange={(url) => dispatch("icon.set", { ref: url })}
        />
      </div>
    </div>
  );
}

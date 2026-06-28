import { useState, type ChangeEvent } from "react";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton, GlassInput, ColorPicker } from "../../design-system/halo";
import { CardPreview } from "./CardPreview";
import { AssetField } from "./AssetField";
import { DeleteTemplateModal } from "./DeleteTemplateModal";
import { useT } from "../../lib/i18n";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  usePublishTemplate,
  useRegisterAsset,
  useDeleteTemplate,
  type CardTemplateDTO,
  type TemplateInput,
} from "./useTemplates";

// Color helpers: <input type="color"> yields hex; API requires rgb(r,g,b)
const toRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
};
const toHex = (rgb?: string) => {
  const m = rgb?.match(/\d+/g);
  if (!m || m.length < 3) return "#ffffff";
  return (
    "#" +
    m
      .slice(0, 3)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
};

interface Form {
  name: string;
  orgName: string;
  logoText: string;
  bgHex: string;
  fgHex: string;
  lblHex: string;
  pLabel: string;
  pKey: string;
  pValue: string;
  ppv: number;
  rThreshold: number;
  iconRef: string;
  logoRef: string;
  stripRef: string;
}

const DEF: Form = {
  name: "",
  orgName: "",
  logoText: "",
  bgHex: "#1a1a2e",
  fgHex: "#e0e0f0",
  lblHex: "#9999bb",
  pLabel: "POINTS",
  pKey: "points",
  pValue: "{{points}}",
  ppv: 1,
  rThreshold: 10,
  iconRef: "",
  logoRef: "",
  stripRef: "",
};

const fromTemplate = (tmpl: CardTemplateDTO): Form => {
  const b = tmpl.brand;
  const pf = b.primaryFields[0] ?? { key: "points", label: "POINTS", valueTemplate: "{{points}}" };
  return {
    name: tmpl.name,
    orgName: b.organizationName,
    logoText: b.logoText ?? "",
    bgHex: toHex(b.backgroundColor),
    fgHex: toHex(b.foregroundColor),
    lblHex: toHex(b.labelColor),
    pLabel: pf.label,
    pKey: pf.key,
    pValue: pf.valueTemplate,
    ppv: tmpl.rewardRule.pointsPerVisit,
    rThreshold: tmpl.rewardRule.rewardThreshold,
    iconRef: b.iconRef ?? "",
    logoRef: b.logoRef ?? "",
    stripRef: b.stripRef ?? "",
  };
};

const toInput = (f: Form): TemplateInput => ({
  name: f.name,
  organizationName: f.orgName,
  logoText: f.logoText || undefined,
  backgroundColor: toRgb(f.bgHex),
  foregroundColor: toRgb(f.fgHex),
  labelColor: f.lblHex ? toRgb(f.lblHex) : undefined,
  headerFields: [],
  primaryFields: [{ key: f.pKey, label: f.pLabel, valueTemplate: f.pValue }],
  secondaryFields: [],
  auxiliaryFields: [],
  backFields: [],
  pointsPerVisit: f.ppv,
  rewardThreshold: f.rThreshold,
  tierRules: [],
});

type CE = ChangeEvent<HTMLInputElement>;
type EditTarget = CardTemplateDTO | "new" | null;

// Accessible field label using the halo eyebrow class
const Lbl = ({ htmlFor, text }: { htmlFor: string; text: string }) => (
  <label htmlFor={htmlFor} className="eyebrow" style={{ display: "block", marginBottom: "0.3rem" }}>
    {text}
  </label>
);

export function BuilderPage() {
  const { t } = useT();
  const [editing, setEditing] = useState<EditTarget>(null);
  const [form, setForm] = useState<Form>(DEF);
  const [status, setStatus] = useState<string | null>(null);
  const [awaitConfirm, setAwaitConfirm] = useState(false);

  const [confirmCard, setConfirmCard] = useState<CardTemplateDTO | null>(null);

  const templates = useTemplates();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const publishMut = usePublishTemplate();
  const assetMut = useRegisterAsset();
  const deleteMut = useDeleteTemplate();

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const openNew = () => {
    setForm(DEF);
    setEditing("new");
    setStatus(null);
  };
  const openEdit = (card: CardTemplateDTO) => {
    setForm(fromTemplate(card));
    setEditing(card);
    setStatus(null);
  };
  const closeEdit = () => {
    setEditing(null);
    setStatus(null);
    setAwaitConfirm(false);
  };

  const save = async () => {
    setStatus(null);
    const existing = editing !== "new" ? (editing as CardTemplateDTO) : null;
    const prev = {
      icon: existing?.brand.iconRef ?? "",
      logo: existing?.brand.logoRef ?? "",
      strip: existing?.brand.stripRef ?? "",
    };
    try {
      let id: string;
      if (editing === "new") {
        const tmpl = await createMut.mutateAsync(toInput(form));
        id = tmpl.id;
        setEditing(tmpl);
      } else {
        const tmpl = await updateMut.mutateAsync({ id: existing!.id, input: toInput(form) });
        id = tmpl.id;
        setEditing(tmpl);
      }
      const assets = [
        { kind: "icon" as const, ref: form.iconRef, p: prev.icon },
        { kind: "logo" as const, ref: form.logoRef, p: prev.logo },
        { kind: "strip" as const, ref: form.stripRef, p: prev.strip },
      ].filter((a) => a.ref && a.ref !== a.p);
      await Promise.all(assets.map((a) => assetMut.mutateAsync({ id, kind: a.kind, ref: a.ref })));
      setStatus(t("Draft saved."));
    } catch (err) {
      setStatus((err as { message?: string })?.message ?? t("Save failed."));
    }
  };

  const publish = async () => {
    if (!awaitConfirm) {
      setAwaitConfirm(true);
      return;
    }
    const id = editing !== "new" ? (editing as CardTemplateDTO)?.id : null;
    if (!id) {
      setStatus(t("Save the draft first."));
      setAwaitConfirm(false);
      return;
    }
    try {
      await publishMut.mutateAsync(id);
      setStatus(t("Published."));
      closeEdit();
    } catch (err) {
      setStatus((err as { message?: string })?.message ?? t("Publish failed."));
      setAwaitConfirm(false);
    }
  };

  // List view
  if (!editing) {
    const list = templates.data ?? [];
    return (
      <AppShell title={t("Card Builder")}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
          <GlassButton type="button" onClick={openNew}>
            {t("+ New card")}
          </GlassButton>
        </div>
        {templates.isLoading && (
          <p className="body" aria-live="polite">
            {t("Loading templates…")}
          </p>
        )}
        {templates.isError && (
          <GlassCard className="feature">
            <p className="body" role="alert">
              {t("Could not load templates. Please refresh.")}
            </p>
          </GlassCard>
        )}
        {!templates.isLoading && !templates.isError && list.length === 0 && (
          <GlassCard className="feature">
            <p className="body">{t("No templates yet - create your first loyalty card.")}</p>
          </GlassCard>
        )}
        {list.length > 0 && (
          <div
            className="grid-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
          >
            {list.map((card) => (
              <GlassCard
                key={card.id}
                hover
                light
                className="feature"
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
                aria-label={t("Edit template: {name}", { name: card.name })}
                onClick={() => openEdit(card)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") openEdit(card);
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}
                  >
                    <h2
                      className="cardt"
                      style={{
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {card.name}
                    </h2>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 500,
                        padding: "0.2rem 0.55rem",
                        borderRadius: 999,
                        flexShrink: 0,
                        background:
                          card.status === "published"
                            ? "rgba(0,180,90,.13)"
                            : "rgba(200,160,0,.11)",
                        border: `1px solid ${card.status === "published" ? "rgba(0,180,90,.3)" : "rgba(200,160,0,.26)"}`,
                        color: card.status === "published" ? "rgb(0,150,70)" : "rgb(150,110,0)",
                      }}
                    >
                      {t(card.status)}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={t("Delete template: {name}", { name: card.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmCard(card);
                    }}
                    style={{
                      flexShrink: 0,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0.3rem",
                      borderRadius: "0.35rem",
                      color: "var(--muted)",
                      lineHeight: 0,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#b93333")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>
                <p className="body" style={{ margin: "0.4rem 0 0" }}>
                  {card.brand.organizationName}
                </p>
                <p className="body" style={{ margin: "0.2rem 0 0", fontSize: "0.82rem" }}>
                  v{card.version} · {new Date(card.updatedAt).toLocaleDateString()}
                </p>
              </GlassCard>
            ))}
          </div>
        )}
        {confirmCard && (
          <DeleteTemplateModal
            card={confirmCard}
            busy={deleteMut.isPending}
            onCancel={() => setConfirmCard(null)}
            onConfirm={async () => {
              await deleteMut.mutateAsync(confirmCard.id);
              setConfirmCard(null);
            }}
          />
        )}
      </AppShell>
    );
  }

  // Edit view
  const isBusy = createMut.isPending || updateMut.isPending;
  const saved = editing !== "new" ? (editing as CardTemplateDTO) : null;
  const isPublished = saved?.status === "published";

  const colorFields = [
    { label: "Background", id: "bg", field: "bgHex" as keyof Form },
    { label: "Text color", id: "fg", field: "fgHex" as keyof Form },
    { label: "Label color", id: "lbl", field: "lblHex" as keyof Form },
  ] as const;

  return (
    <AppShell title={saved ? t("Edit: {name}", { name: saved.name }) : t("New card")}>
      <div style={{ marginBottom: "1rem" }}>
        <GlassButton
          type="button"
          variant="ghost"
          onClick={closeEdit}
          aria-label={t("Back to templates list")}
        >
          {t("← Back")}
        </GlassButton>
      </div>
      <div
        className="grid-3"
        style={{ gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start" }}
      >
        {/* Form */}
        <GlassCard
          className="feature"
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <h2 className="cardt" id="editor-heading">
            {t("Card settings")}
          </h2>

          <div>
            <Lbl htmlFor="f-name" text={t("Template name *")} />
            <GlassInput
              id="f-name"
              value={form.name}
              placeholder={t("e.g. Summer Campaign")}
              maxLength={100}
              required
              aria-required="true"
              onChange={(e: CE) => patch({ name: e.target.value })}
            />
          </div>

          <div>
            <Lbl htmlFor="f-org" text={t("Business name *")} />
            <GlassInput
              id="f-org"
              value={form.orgName}
              placeholder={t("Shown on the card")}
              maxLength={64}
              required
              aria-required="true"
              onChange={(e: CE) => patch({ orgName: e.target.value })}
            />
          </div>

          <div>
            <Lbl htmlFor="f-logo" text={t("Logo text (max 24 chars)")} />
            <GlassInput
              id="f-logo"
              value={form.logoText}
              placeholder={t("e.g. LOYALTY")}
              maxLength={24}
              onChange={(e: CE) => patch({ logoText: e.target.value })}
            />
          </div>

          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="eyebrow" style={{ marginBottom: "0.5rem" }}>
              {t("Colors")}
            </legend>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
              {colorFields.map(({ label, id, field }) => (
                <div key={id}>
                  <label
                    htmlFor={`cp-${id}`}
                    className="eyebrow"
                    style={{ display: "block", marginBottom: "0.3rem" }}
                  >
                    {t(label)}
                  </label>
                  <ColorPicker
                    id={`cp-${id}`}
                    ariaLabel={t("{label} color", { label: t(label) })}
                    value={form[field] as string}
                    onChange={(hex) => patch({ [field]: hex } as Partial<Form>)}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="eyebrow" style={{ marginBottom: "0.5rem" }}>
              {t("Primary field *")}
            </legend>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <GlassInput
                value={form.pLabel}
                placeholder={t("Label (e.g. POINTS)")}
                aria-label={t("Primary field label")}
                onChange={(e: CE) => patch({ pLabel: e.target.value })}
              />
              <GlassInput
                value={form.pValue}
                placeholder={t("Template (e.g. {{points}})")}
                aria-label={t("Primary field value template")}
                onChange={(e: CE) => patch({ pValue: e.target.value })}
              />
            </div>
          </fieldset>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <Lbl htmlFor="f-ppv" text={t("Points per visit")} />
              <GlassInput
                id="f-ppv"
                type="number"
                min={1}
                value={form.ppv}
                onChange={(e: CE) => patch({ ppv: Math.max(1, Number(e.target.value)) })}
              />
            </div>
            <div>
              <Lbl htmlFor="f-rth" text={t("Reward threshold")} />
              <GlassInput
                id="f-rth"
                type="number"
                min={1}
                value={form.rThreshold}
                onChange={(e: CE) => patch({ rThreshold: Math.max(1, Number(e.target.value)) })}
              />
            </div>
          </div>

          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="eyebrow" style={{ marginBottom: "0.75rem" }}>
              {t("Card images")}
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <AssetField
                kind="icon"
                label={t("Icon *")}
                hint={t("Required to publish. Pick a Lucide icon or upload a 29×29 px PNG.")}
                value={form.iconRef}
                iconColor={toRgb(form.fgHex)}
                onChange={(url) => patch({ iconRef: url })}
              />
              <AssetField
                kind="logo"
                label={t("Logo")}
                hint={t("Shown top-left on the pass. Upload ≤160×50 px PNG.")}
                value={form.logoRef}
                onChange={(url) => patch({ logoRef: url })}
              />
              <AssetField
                kind="strip"
                label={t("Strip")}
                hint={t("Full-width banner. Upload 375×144 px PNG.")}
                value={form.stripRef}
                onChange={(url) => patch({ stripRef: url })}
              />
            </div>
          </fieldset>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
            <GlassButton
              type="button"
              onClick={save}
              disabled={isBusy || !form.name || !form.orgName}
              aria-busy={isBusy}
            >
              {isBusy ? t("Saving…") : t("Save draft")}
            </GlassButton>
            {saved && !isPublished && (
              <GlassButton
                type="button"
                variant="ghost"
                onClick={publish}
                disabled={publishMut.isPending}
                aria-busy={publishMut.isPending}
              >
                {publishMut.isPending
                  ? t("Publishing…")
                  : awaitConfirm
                    ? t("Confirm publish?")
                    : t("Publish")}
              </GlassButton>
            )}
            {awaitConfirm && (
              <GlassButton type="button" variant="ghost" onClick={() => setAwaitConfirm(false)}>
                {t("Cancel")}
              </GlassButton>
            )}
          </div>

          {status && (
            <p
              role="status"
              aria-live="polite"
              className="body"
              style={{ color: /fail|error/i.test(status) ? "#c0392b" : "var(--text)" }}
            >
              {status}
            </p>
          )}
          {isPublished && (
            <p className="body" style={{ color: "var(--muted)" }}>
              {t("Published (v{version}). Saving will create a new draft version.", {
                version: saved!.version,
              })}
            </p>
          )}
        </GlassCard>

        {/* Live preview */}
        <div
          style={{
            position: "sticky",
            top: "6rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <p className="eyebrow" style={{ textAlign: "center" }}>
            {t("Live preview")}
          </p>
          <CardPreview
            organizationName={form.orgName}
            logoText={form.logoText || undefined}
            backgroundColor={toRgb(form.bgHex)}
            foregroundColor={toRgb(form.fgHex)}
            labelColor={form.lblHex ? toRgb(form.lblHex) : undefined}
            primaryLabel={form.pLabel}
            primaryValue={form.pValue}
            logoUrl={form.logoRef || undefined}
            stripUrl={form.stripRef || undefined}
          />
          <p
            className="body"
            style={{
              textAlign: "center",
              fontSize: "0.8rem",
              maxWidth: 260,
              color: "var(--muted)",
            }}
          >
            {t(
              "Preview updates as you type. Actual card appearance may vary with uploaded images.",
            )}
          </p>
        </div>
      </div>
    </AppShell>
  );
}

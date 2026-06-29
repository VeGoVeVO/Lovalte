import { useT } from "../../lib/i18n";
import { ColorPicker } from "../../design-system/halo";
import { resolveGoogleDoc, type CardDoc } from "./cardDoc";
import { AssetField } from "./AssetField";
import type { GSlotKind } from "./GoogleCardCanvas";

type Dispatch = (toolId: string, args?: Record<string, unknown>) => void;

function GoogleLogoEditor({ doc, dispatch }: { doc: CardDoc; dispatch: Dispatch }) {
  const { t } = useT();
  const g = resolveGoogleDoc(doc);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
      <AssetField
        kind="logo"
        label={t("Google logo")}
        hint={t("Brand mark shown on the Google card.")}
        value={g.logoSrc ?? ""}
        onChange={(url) =>
          url
            ? dispatch("google.override.logo", { src: url })
            : dispatch("google.override.logoClear", {})
        }
      />
      <div>
        <label className="lvt-be-eyebrow">{t("Card title")}</label>
        <input
          className="input"
          value={g.cardTitle}
          maxLength={80}
          onChange={(e) => dispatch("google.override.cardTitle", { value: e.target.value })}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => dispatch("google.override.clear", { field: "logoSrc" })}
        >
          {t("Reset logo")}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => dispatch("google.override.clear", { field: "cardTitle" })}
        >
          {t("Reset title")}
        </button>
      </div>
    </div>
  );
}

function GoogleTextModulesEditor({ doc, dispatch }: { doc: CardDoc; dispatch: Dispatch }) {
  const { t } = useT();
  const g = resolveGoogleDoc(doc);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
      {g.textModules.map((m) => (
        <div key={m.id} style={{ display: "flex", gap: 6 }}>
          <input
            className="input"
            value={m.header}
            placeholder={t("Label")}
            maxLength={50}
            onChange={(e) =>
              dispatch("google.override.textModule", {
                id: m.id,
                header: e.target.value,
                body: m.body,
              })
            }
            style={{ flex: 1, minWidth: 0 }}
          />
          <input
            className="input"
            value={m.body}
            placeholder={t("Value")}
            maxLength={255}
            onChange={(e) =>
              dispatch("google.override.textModule", {
                id: m.id,
                header: m.header,
                body: e.target.value,
              })
            }
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            className="btn ghost"
            aria-label={t("Remove")}
            onClick={() => dispatch("google.override.textModuleRemove", { id: m.id })}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost"
        onClick={() => dispatch("google.override.clear", { field: "textModules" })}
      >
        {t("Reset to Apple fields")}
      </button>
    </div>
  );
}

export function GoogleComponentEditor({
  doc,
  sel,
  dispatch,
}: {
  doc: CardDoc;
  sel: Exclude<GSlotKind, null>;
  dispatch: Dispatch;
}) {
  const { t } = useT();
  const g = resolveGoogleDoc(doc);

  if (sel === "colors") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 248 }}>
        <ColorPicker
          ariaLabel={t("Google background")}
          value={g.bg}
          onChange={(v) => dispatch("google.override.bg", { value: v })}
          defaultOpen
        />
      </div>
    );
  }
  if (sel === "logo") return <GoogleLogoEditor doc={doc} dispatch={dispatch} />;
  if (sel === "hero") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
        <AssetField
          kind="strip"
          label={t("Hero image")}
          hint={t("Banner image at the top of the Google card.")}
          value={g.heroSrc ?? ""}
          onChange={(url) =>
            url
              ? dispatch("google.override.hero", { src: url })
              : dispatch("google.override.heroClear", {})
          }
        />
      </div>
    );
  }
  if (sel === "textModules") return <GoogleTextModulesEditor doc={doc} dispatch={dispatch} />;
  return null;
}

import { GlassInput } from "../../design-system/halo";
import { useT } from "../../lib/i18n";

export interface FieldRow {
  label: string;
  value: string;
}

interface Props {
  title: string;
  hint: string;
  fields: FieldRow[];
  onChange: (fields: FieldRow[]) => void;
  /** Hard cap on rows in this list (Apple region limit). */
  max: number;
  /** External gate, e.g. the shared secondary+auxiliary pool is full. */
  addDisabled?: boolean;
  labelPlaceholder?: string;
  valuePlaceholder?: string;
}

/**
 * Edits one Apple Wallet field region as a list of label/value rows. Reused for
 * header, secondary, auxiliary and back fields. Caps the count at the region's
 * Apple limit and never lets a merchant build a field the pass can't render.
 */
export function FieldListEditor({
  title,
  hint,
  fields,
  onChange,
  max,
  addDisabled = false,
  labelPlaceholder,
  valuePlaceholder,
}: Props) {
  const { t } = useT();
  const setRow = (i: number, patch: Partial<FieldRow>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeRow = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const addRow = () => onChange([...fields, { label: "", value: "" }]);
  const full = fields.length >= max || addDisabled;

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      <legend className="eyebrow" style={{ marginBottom: "0.2rem" }}>
        {title}
      </legend>
      <p
        className="body"
        style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 0.6rem" }}
      >
        {hint}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {fields.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <GlassInput
                value={f.label}
                maxLength={40}
                placeholder={labelPlaceholder ?? t("Label")}
                aria-label={t("{title} field {n} label", { title, n: i + 1 })}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRow(i, { label: e.target.value })
                }
              />
            </div>
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <GlassInput
                value={f.value}
                maxLength={120}
                placeholder={valuePlaceholder ?? t("Value")}
                aria-label={t("{title} field {n} value", { title, n: i + 1 })}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRow(i, { value: e.target.value })
                }
              />
            </div>
            <button
              type="button"
              className="btn ghost"
              aria-label={t("Remove {title} field {n}", { title, n: i + 1 })}
              onClick={() => removeRow(i)}
              style={{ flexShrink: 0, padding: "0.4rem 0.6rem", lineHeight: 0 }}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn ghost"
        disabled={full}
        onClick={addRow}
        style={{
          marginTop: fields.length ? "0.6rem" : 0,
          fontSize: "0.82rem",
          padding: "0.4rem 0.8rem",
          opacity: full ? 0.5 : 1,
        }}
      >
        {t("+ Add field")} {max > 0 && `(${fields.length}/${max})`}
      </button>
    </fieldset>
  );
}

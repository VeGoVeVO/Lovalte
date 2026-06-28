import { useEffect, useRef } from "react";
import { GlassCard } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import type { CardTemplateDTO } from "./useTemplates";

interface Props {
  card: CardTemplateDTO;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirm-delete dialog for a card design. The copy adapts to how many passes
 * are already live: a clean permanent-delete when nothing was issued, or an
 * honest "their cards keep working" reassurance when customers hold it.
 */
export function DeleteTemplateModal({ card, busy, onCancel, onConfirm }: Props) {
  const { t } = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the safe (Cancel) action on open; Esc closes.
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const n = card.issuedCount;
  const liveLine =
    n === 1
      ? t("1 customer already has this card in their Apple Wallet.")
      : t("{count} customers already have this card in their Apple Wallet.", { count: n });

  return (
    <div
      onClick={() => !busy && onCancel()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,20,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
      }}
    >
      <GlassCard
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-title"
        aria-describedby="del-body"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          maxWidth: 460,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2 id="del-title" className="cardt" style={{ margin: 0 }}>
          {t("Delete “{name}”?", { name: card.name })}
        </h2>

        <div id="del-body" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {n === 0 ? (
            <p className="body" style={{ margin: 0 }}>
              {t(
                "Nothing has been issued from this design yet, so it will be permanently deleted. This can't be undone.",
              )}
            </p>
          ) : (
            <>
              <p className="body" style={{ margin: 0, fontWeight: 500 }}>
                {liveLine}
              </p>
              <p className="body" style={{ margin: 0 }}>
                {t(
                  "Deleting removes the design from your dashboard and stops new sign-ups - but cards already in customer wallets keep working and keep earning points. You just won't be able to issue new ones from this design.",
                )}
              </p>
            </>
          )}
        </div>

        <div
          style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}
        >
          <button
            ref={cancelRef}
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "0.6rem",
              background: "rgba(185,51,51,0.12)",
              border: "1px solid rgba(185,51,51,0.4)",
              color: "#b93333",
              cursor: busy ? "default" : "pointer",
              fontWeight: 600,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? t("Deleting…") : t("Delete card")}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

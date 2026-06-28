import { Modal } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import type { CardTemplateDTO } from "./useTemplates";

interface Props {
  card: CardTemplateDTO;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirm-delete dialog for a card design. Built on the shared <Modal> baseline.
 * Copy adapts to how many passes are live: a clean permanent-delete when none
 * exist, or an honest warning that customers' Wallet cards will be deactivated.
 */
export function DeleteTemplateModal({ card, busy, onCancel, onConfirm }: Props) {
  const { t } = useT();
  const n = card.issuedCount;
  const liveLine =
    n === 1
      ? t("1 customer already has this card in their Apple Wallet.")
      : t("{count} customers already have this card in their Apple Wallet.", { count: n });

  return (
    <Modal onClose={onCancel} busy={busy} labelledBy="del-title" describedBy="del-body">
      <h2 id="del-title" className="cardt lvt-modal-title">
        <span className="lvt-modal-mark danger" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </span>
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
                "Deleting deactivates those cards: each one updates in the customer's Apple Wallet to a deprecated Lovalte card telling them it no longer works and to remove it, and it stops earning points. This can't be undone.",
              )}
            </p>
          </>
        )}
      </div>

      <div className="lvt-modal-actions">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="lvt-modal-danger"
          disabled={busy}
          aria-busy={busy}
          onClick={onConfirm}
        >
          {busy ? t("Deleting…") : t("Delete card")}
        </button>
      </div>
    </Modal>
  );
}

import { useT } from "../../lib/i18n";

/* ── shared types (mirror the support context DTOs) ──────────────────────────── */
export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type AuthorKind = "user" | "admin";

export interface TicketMessageDTO {
  id: string;
  authorKind: AuthorKind;
  authorEmail: string;
  body: string;
  createdAt: string;
}

export interface TicketSummary {
  id: string;
  tenantId: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdByEmail: string;
  lastReplyAt: string | null;
  lastReplyBy: AuthorKind | null;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessageDTO[];
}

export const STATUS_ORDER: TicketStatus[] = ["open", "pending", "resolved", "closed"];
export const PRIORITY_ORDER: TicketPriority[] = ["low", "normal", "high", "urgent"];

/* ── visual meta (token-driven; color never carries meaning alone — a label always
      accompanies it, and badges meet >=3:1 against the card) ───────────────────── */
const STATUS_META: Record<TicketStatus, { bg: string; dot: string; label: string }> = {
  open: { bg: "var(--ice)", dot: "#2b6dc4", label: "Open" },
  pending: { bg: "var(--lavender)", dot: "#6b4fb0", label: "Pending" },
  resolved: { bg: "var(--mint)", dot: "#1f8a52", label: "Resolved" },
  closed: { bg: "rgba(32,36,42,.08)", dot: "#6F7684", label: "Closed" },
};

const PRIORITY_META: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: "Low", color: "#6F7684" },
  normal: { label: "Normal", color: "#2b6dc4" },
  high: { label: "High", color: "#7a4512" }, // darkened to clear WCAG 4.5:1 at 0.68rem
  urgent: { label: "Urgent", color: "#c23b63" },
};

export function statusLabel(t: (s: string) => string, s: TicketStatus): string {
  return t(STATUS_META[s].label);
}
export function priorityLabel(t: (s: string) => string, p: TicketPriority): string {
  return t(PRIORITY_META[p].label);
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useT();
  const m = STATUS_META[status];
  return (
    <span
      aria-label={t("Status: {status}", { status: t(m.label) })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4em",
        fontSize: "0.72rem",
        fontWeight: 600,
        padding: "0.22em 0.7em",
        borderRadius: "var(--r-pill)",
        background: m.bg,
        color: "var(--text)",
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: m.dot }} />
      {t(m.label)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const { t } = useT();
  if (priority === "normal" || priority === "low") return null; // only surface the ones that need attention
  const m = PRIORITY_META[priority];
  return (
    <span
      aria-label={t("Priority: {priority}", { priority: t(m.label) })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35em",
        fontSize: "0.68rem",
        fontWeight: 600,
        color: m.color,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: m.color }} />
      {t(m.label)}
    </span>
  );
}

/** Compact relative time ("just now", "5m", "3h", "2d"), falling back to a date. */
export function relativeTime(iso: string, t: (s: string, v?: Record<string, string | number>) => string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("just now");
  if (min < 60) return t("{n}m", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("{n}h", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t("{n}d", { n: day });
  return new Date(iso).toLocaleDateString();
}

/** One message in a thread. `mineKind` decides which side is right-aligned. */
export function MessageBubble({
  message,
  mineKind,
}: {
  message: TicketMessageDTO;
  mineKind: AuthorKind;
}) {
  const { t } = useT();
  const mine = message.authorKind === mineKind;
  const isAdmin = message.authorKind === "admin";
  const who = isAdmin ? t("Support team") : message.authorEmail;
  return (
    <div
      className="lvt-msg"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
        gap: "0.25rem",
      }}
    >
      <div
        style={{
          maxWidth: "min(82%, 38rem)",
          padding: "0.7rem 0.95rem",
          borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: mine ? "var(--card-strong)" : isAdmin ? "var(--ice)" : "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-soft)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.5,
          fontSize: "0.95rem",
          color: "var(--text)",
        }}
      >
        {message.body}
      </div>
      <span style={{ fontSize: "0.68rem", color: "var(--muted)", padding: "0 0.25rem" }}>
        {who} · {relativeTime(message.createdAt, t)}
      </span>
    </div>
  );
}

/** Page-scoped animation CSS (injected once per page). Motion is reduced-motion safe. */
export const ticketCss = `
@keyframes lvtMsgIn { from { opacity:0; transform:translateY(10px) scale(.985); } to { opacity:1; transform:none; } }
@keyframes lvtPanelIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
@keyframes lvtCount { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
.lvt-msg { animation: lvtMsgIn .34s var(--ease) both; }
.lvt-panel { animation: lvtPanelIn .3s var(--ease) both; }
.lvt-kpi { animation: lvtCount .4s var(--ease) both; }
.lvt-trow { transition: transform var(--d-fast) var(--ease), box-shadow var(--d-fast) var(--ease), border-color var(--d-fast) var(--ease); }
.lvt-trow:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }
.lvt-trow:focus-visible { outline: none; border-color: rgba(91,167,201,.7); box-shadow: var(--shadow-soft), 0 0 0 4px rgba(169,245,255,.3); }
.lvt-trow[aria-current="true"] { border-color: rgba(91,167,201,.7); box-shadow: var(--shadow-soft), 0 0 0 1px rgba(91,167,201,.4); }
.lvt-seg { transition: color var(--d-fast) var(--ease), background var(--d-fast) var(--ease); }
@media (prefers-reduced-motion: reduce) {
  .lvt-msg, .lvt-panel, .lvt-kpi { animation: none !important; }
  .lvt-trow:hover { transform: none; }
}
/* Windows High Contrast / forced-colors: box-shadow + border rings are dropped,
   so restore a real outline for the keyboard focus indicator. */
@media (forced-colors: active) {
  .lvt-trow:focus-visible { outline: 2px solid ButtonText; outline-offset: -2px; }
}
`;

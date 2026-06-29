import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton, GlassInput, Dropdown, Icon } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import {
  ticketCss,
  StatusBadge,
  PriorityBadge,
  MessageBubble,
  relativeTime,
  statusLabel,
  priorityLabel,
  STATUS_ORDER,
  PRIORITY_ORDER,
  type TicketSummary,
  type TicketDetail,
  type TicketStatus,
  type TicketPriority,
} from "../support/ticketUI";

interface TicketStats {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  total: number;
}

const pageCss = `
.lvt-adm { display:grid; grid-template-columns: minmax(0,380px) minmax(0,1fr); gap:1.25rem; align-items:start; }
.lvt-adm-list { display:flex; flex-direction:column; gap:.7rem; min-width:0; }
.lvt-adm-main { min-width:0; position:sticky; top:1.5rem; }
.lvt-kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:.75rem; margin-bottom:1.5rem; }
.lvt-seg-wrap { display:flex; flex-wrap:wrap; gap:.3rem; }
.lvt-seg { font:inherit; font-size:.82rem; font-weight:500; cursor:pointer; padding:.4rem .8rem; border-radius:var(--r-pill);
  border:1px solid transparent; background:transparent; color:var(--muted); }
.lvt-seg:hover { background:var(--card); color:var(--text); }
.lvt-seg[aria-pressed="true"] { background:var(--card-strong); color:var(--text); border-color:var(--border); box-shadow:var(--shadow-soft); }
.lvt-back { display:none; }
.lvt-trow { width:100%; text-align:left; cursor:pointer; padding:1rem 1.1rem; display:flex; flex-direction:column; gap:.5rem; }
.lvt-thread { display:flex; flex-direction:column; gap:.85rem; max-height:min(52vh, 520px); overflow-y:auto; padding:.25rem .25rem .25rem 0; }
@media (max-width: 767px) {
  .lvt-adm { grid-template-columns: 1fr; }
  .lvt-adm[data-panel="true"] .lvt-adm-list { display:none; }
  .lvt-adm[data-panel="false"] .lvt-adm-main { display:none; }
  .lvt-adm-main { position:static; }
  .lvt-back { display:inline-flex; }
}
`;

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.3rem", fontWeight: 500,
};

/* ── KPI strip ───────────────────────────────────────────────────────────────── */
function Kpis() {
  const { t } = useT();
  const { data } = useQuery<TicketStats, ApiError>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<TicketStats>("/api/v1/admin/tickets/stats"),
  });
  const cards: { label: string; value: number; dot: string }[] = [
    { label: t("Open"), value: data?.open ?? 0, dot: "#2b6dc4" },
    { label: t("Pending"), value: data?.pending ?? 0, dot: "#6b4fb0" },
    { label: t("Resolved"), value: data?.resolved ?? 0, dot: "#1f8a52" },
    { label: t("Closed"), value: data?.closed ?? 0, dot: "#9aa0ab" },
    { label: t("Total"), value: data?.total ?? 0, dot: "#6F7684" },
  ];
  return (
    <div className="lvt-kpis">
      {cards.map((c, i) => (
        <GlassCard key={c.label} light className="lvt-kpi" style={{ padding: "1.1rem 1.25rem", animationDelay: `${i * 50}ms` }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".45rem", color: "var(--muted)", fontSize: ".8rem", fontWeight: 500 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot }} />
            {c.label}
          </div>
          <div style={{ fontSize: "1.9rem", fontWeight: 500, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", marginTop: ".2rem" }}>
            {c.value.toLocaleString()}
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

/* ── Admin thread (reply + manage) ───────────────────────────────────────────── */
function AdminThread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: ticket, isLoading, isError } = useQuery<TicketDetail, ApiError>({
    queryKey: ["admin-ticket", ticketId],
    queryFn: () => api.get<TicketDetail>(`/api/v1/admin/tickets/${ticketId}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const send = useMutation({
    mutationFn: (body: string) => api.post<TicketDetail>(`/api/v1/admin/tickets/${ticketId}/messages`, { body }),
    onSuccess: () => { setReply(""); invalidate(); },
  });
  const update = useMutation({
    mutationFn: (patch: { status?: TicketStatus; priority?: TicketPriority }) =>
      api.patch<TicketDetail>(`/api/v1/admin/tickets/${ticketId}`, patch),
    onSuccess: invalidate,
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [ticket?.messages.length]);

  return (
    <GlassCard light className="feature lvt-panel" aria-label={t("Manage ticket")}>
      <button className="btn ghost lvt-back" type="button" onClick={onBack}
        style={{ padding: ".35rem .5rem", marginBottom: ".4rem" }} aria-label={t("Back to tickets")}>
        ← {t("Back")}
      </button>

      {isError ? (
        <p className="body" role="alert">{t("Could not load this ticket.")}</p>
      ) : isLoading || !ticket ? (
        <p className="body" aria-busy="true" aria-live="polite">{t("Loading…")}</p>
      ) : (
        <>
          <h2 className="section" style={{ fontSize: "1.15rem", overflowWrap: "anywhere" }}>{ticket.subject}</h2>
          <p className="body" style={{ margin: "0 0 .5rem", fontSize: ".85rem" }}>
            {t("From {email}", { email: ticket.createdByEmail })} · {t("opened {when}", { when: relativeTime(ticket.createdAt, t) })}
          </p>

          {/* manage controls */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginBottom: ".5rem" }}>
            <div style={{ flex: "1 1 9rem", minWidth: "8rem" }}>
              <label htmlFor="a-status" style={labelStyle}>{t("Status")}</label>
              <Dropdown
                id="a-status"
                ariaLabel={t("Status")}
                value={ticket.status}
                onChange={(v) => update.mutate({ status: v as TicketStatus })}
                options={STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(t, s) }))}
              />
            </div>
            <div style={{ flex: "1 1 9rem", minWidth: "8rem" }}>
              <label htmlFor="a-priority" style={labelStyle}>{t("Priority")}</label>
              <Dropdown
                id="a-priority"
                ariaLabel={t("Priority")}
                value={ticket.priority}
                onChange={(v) => update.mutate({ priority: v as TicketPriority })}
                options={PRIORITY_ORDER.map((p) => ({ value: p, label: priorityLabel(t, p) }))}
              />
            </div>
          </div>

          <div className="lvt-thread" role="log" aria-label={t("Messages")} aria-live="polite">
            {ticket.messages.map((m) => <MessageBubble key={m.id} message={m} mineKind="admin" />)}
            <div ref={bottomRef} />
          </div>

          {ticket.status === "closed" ? (
            <p className="body" style={{ margin: ".5rem 0 0", fontSize: ".9rem" }}>
              {t("This ticket is closed. Change the status above to reply.")}
            </p>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (reply.trim()) send.mutate(reply.trim()); }}
              style={{ display: "flex", flexDirection: "column", gap: ".6rem", marginTop: ".5rem" }}
            >
              <label htmlFor="a-reply" style={labelStyle}>{t("Reply as Support")}</label>
              <textarea
                id="a-reply"
                className="input"
                value={reply}
                maxLength={5000}
                rows={3}
                placeholder={t("Write a reply to the customer…")}
                aria-label={t("Reply as Support")}
                onChange={(e) => setReply(e.target.value)}
                style={{ resize: "vertical", minHeight: "4.5rem", fontFamily: "inherit" }}
              />
              <div>
                <GlassButton type="submit" disabled={send.isPending || !reply.trim()}>
                  <Icon.Arrow aria-hidden="true" /> {send.isPending ? t("Sending…") : t("Send reply")}
                </GlassButton>
              </div>
            </form>
          )}
        </>
      )}
    </GlassCard>
  );
}

/* ── List row ────────────────────────────────────────────────────────────────── */
function AdminRow({ ticket, active, onSelect }: { ticket: TicketSummary; active: boolean; onSelect: () => void }) {
  const { t } = useT();
  const when = ticket.lastReplyAt ?? ticket.createdAt;
  return (
    <button type="button" className="glass lvt-trow" aria-current={active} onClick={onSelect}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem" }}>
        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
        <PriorityBadge priority={ticket.priority} />
      </div>
      <div style={{ fontSize: ".75rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ticket.createdByEmail}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem" }}>
        <StatusBadge status={ticket.status} />
        <span style={{ fontSize: ".72rem", color: "var(--muted)" }}>
          {ticket.lastReplyBy === "user" ? t("Customer replied") : t("Updated")} · {relativeTime(when, t)}
        </span>
      </div>
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────────── */
export function AdminPage() {
  const { t } = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data: tickets, isLoading, isError } = useQuery<TicketSummary[], ApiError>({
    queryKey: ["admin-tickets", statusFilter, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (q) params.set("q", q);
      const qs = params.toString();
      return api.get<TicketSummary[]>(`/api/v1/admin/tickets${qs ? `?${qs}` : ""}`);
    },
  });

  const segments: { value: "all" | TicketStatus; label: string }[] = [
    { value: "all", label: t("All") },
    ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(t, s) })),
  ];

  return (
    <AppShell title={t("Support desk")}>
      <style>{ticketCss}</style>
      <style>{pageCss}</style>

      <Kpis />

      <div className="lvt-adm" data-panel={selectedId !== null}>
        {/* List + filters */}
        <div className="lvt-adm-list">
          <div className="lvt-seg-wrap" role="group" aria-label={t("Filter by status")}>
            {segments.map((s) => (
              <button
                key={s.value}
                type="button"
                className="lvt-seg"
                aria-pressed={statusFilter === s.value}
                onClick={() => setStatusFilter(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <GlassInput
            type="search"
            value={search}
            maxLength={100}
            placeholder={t("Search subject or email…")}
            aria-label={t("Search tickets")}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />

          {isError ? (
            <GlassCard className="feature"><p className="body" role="alert" style={{ margin: 0 }}>{t("Could not load tickets.")}</p></GlassCard>
          ) : isLoading ? (
            <GlassCard className="feature"><p className="body" style={{ margin: 0 }} aria-busy="true">{t("Loading…")}</p></GlassCard>
          ) : !tickets?.length ? (
            <GlassCard className="feature" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
              <p className="body" style={{ margin: 0 }}>{t("No tickets match this view.")}</p>
            </GlassCard>
          ) : (
            tickets.map((tk) => (
              <AdminRow key={tk.id} ticket={tk} active={tk.id === selectedId} onSelect={() => setSelectedId(tk.id)} />
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lvt-adm-main">
          {selectedId ? (
            <AdminThread ticketId={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <GlassCard className="feature lvt-panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
              <p style={{ margin: "0 0 .35rem", fontWeight: 500 }}>{t("Support desk")}</p>
              <p className="body" style={{ margin: 0 }}>{t("Select a ticket to read the thread and reply.")}</p>
            </GlassCard>
          )}
        </div>
      </div>
    </AppShell>
  );
}

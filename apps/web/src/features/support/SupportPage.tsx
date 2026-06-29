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
  PRIORITY_ORDER,
  priorityLabel,
  type TicketSummary,
  type TicketDetail,
  type TicketPriority,
} from "./ticketUI";

const pageCss = `
.lvt-sup { display:grid; grid-template-columns: minmax(0,360px) minmax(0,1fr); gap:1.25rem; align-items:start; }
.lvt-sup-list { display:flex; flex-direction:column; gap:.75rem; min-width:0; }
.lvt-sup-main { min-width:0; position:sticky; top:1.5rem; }
.lvt-back { display:none; }
@media (max-width: 767px) {
  .lvt-sup { grid-template-columns: 1fr; }
  .lvt-sup[data-panel="true"] .lvt-sup-list { display:none; }
  .lvt-sup[data-panel="false"] .lvt-sup-main { display:none; }
  .lvt-sup-main { position:static; }
  .lvt-back { display:inline-flex; }
}
.lvt-trow { width:100%; text-align:left; cursor:pointer; padding:1rem 1.1rem; display:flex; flex-direction:column; gap:.5rem; }
.lvt-thread { display:flex; flex-direction:column; gap:.85rem; max-height:min(58vh, 560px); overflow-y:auto; padding:.25rem .25rem .25rem 0; }
`;

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  color: "var(--muted)",
  marginBottom: "0.35rem",
  fontWeight: 500,
};

/* ── New-ticket composer ─────────────────────────────────────────────────────── */
function NewTicket({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: { subject: string; body: string; priority: TicketPriority }) =>
      api.post<TicketDetail>("/api/v1/support/tickets", input),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      onCreated(ticket.id);
    },
    onError: (e: ApiError) => setError(e.message ?? t("Could not create the ticket")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate({ subject: subject.trim(), body: body.trim(), priority });
  };

  return (
    <GlassCard light className="feature lvt-panel" aria-label={t("New support ticket")}>
      <h2 className="section" style={{ fontSize: "1.15rem" }}>{t("New support ticket")}</h2>
      <p className="body" style={{ margin: "0 0 .5rem" }}>
        {t("Tell us what's going on and we'll get back to you here.")}
      </p>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }} noValidate>
        <div>
          <label htmlFor="t-subject" style={labelStyle}>{t("Subject")}</label>
          <GlassInput
            id="t-subject"
            value={subject}
            maxLength={200}
            placeholder={t("e.g. My loyalty cards aren't scanning")}
            aria-label={t("Subject")}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="t-priority" style={labelStyle}>{t("Priority")}</label>
          <Dropdown
            id="t-priority"
            ariaLabel={t("Priority")}
            value={priority}
            onChange={(v) => setPriority(v as TicketPriority)}
            options={PRIORITY_ORDER.map((p) => ({ value: p, label: priorityLabel(t, p) }))}
          />
        </div>
        <div>
          <label htmlFor="t-body" style={labelStyle}>{t("Message")}</label>
          <textarea
            id="t-body"
            className="input"
            value={body}
            maxLength={5000}
            rows={5}
            placeholder={t("Describe the issue in as much detail as you can…")}
            aria-label={t("Message")}
            onChange={(e) => setBody(e.target.value)}
            style={{ resize: "vertical", minHeight: "7rem", fontFamily: "inherit" }}
            required
          />
        </div>
        {error ? <p className="body" role="alert" style={{ margin: 0, fontSize: "0.9rem", color: "#c23b63" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: ".6rem" }}>
          <GlassButton type="submit" disabled={create.isPending || !subject.trim() || !body.trim()}>
            {create.isPending ? t("Sending…") : t("Submit ticket")}
          </GlassButton>
          <GlassButton type="button" variant="ghost" onClick={onCancel}>{t("Cancel")}</GlassButton>
        </div>
      </form>
    </GlassCard>
  );
}

/* ── Thread + reply ──────────────────────────────────────────────────────────── */
function Thread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: ticket, isLoading, isError } = useQuery<TicketDetail, ApiError>({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => api.get<TicketDetail>(`/api/v1/support/tickets/${ticketId}`),
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      api.post<TicketDetail>(`/api/v1/support/tickets/${ticketId}/messages`, { body }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [ticket?.messages.length]);

  const closed = ticket?.status === "closed";

  return (
    <GlassCard light className="feature lvt-panel" aria-label={t("Ticket conversation")}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: ".75rem" }}>
        <div style={{ minWidth: 0 }}>
          <button className="btn ghost lvt-back" type="button" onClick={onBack}
            style={{ padding: ".35rem .5rem", marginBottom: ".4rem" }} aria-label={t("Back to tickets")}>
            ← {t("Back")}
          </button>
          <h2 className="section" style={{ fontSize: "1.15rem", overflowWrap: "anywhere" }}>
            {ticket?.subject ?? t("Loading…")}
          </h2>
        </div>
        {ticket ? <StatusBadge status={ticket.status} /> : null}
      </div>

      {isError ? (
        <p className="body" role="alert">{t("Could not load this ticket.")}</p>
      ) : isLoading || !ticket ? (
        <p className="body" aria-busy="true" aria-live="polite">{t("Loading…")}</p>
      ) : (
        <>
          <div className="lvt-thread" role="log" aria-label={t("Messages")} aria-live="polite">
            {ticket.messages.map((m) => <MessageBubble key={m.id} message={m} mineKind="user" />)}
            <div ref={bottomRef} />
          </div>

          {closed ? (
            <p className="body" style={{ margin: ".5rem 0 0", fontSize: ".9rem" }}>
              {t("This ticket is closed. Open a new ticket if you still need help.")}
            </p>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (reply.trim()) send.mutate(reply.trim()); }}
              style={{ display: "flex", flexDirection: "column", gap: ".6rem", marginTop: ".5rem" }}
            >
              <label htmlFor="t-reply" style={labelStyle}>{t("Your reply")}</label>
              <textarea
                id="t-reply"
                className="input"
                value={reply}
                maxLength={5000}
                rows={3}
                placeholder={t("Write a reply…")}
                aria-label={t("Your reply")}
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
function TicketRow({ ticket, active, onSelect }: { ticket: TicketSummary; active: boolean; onSelect: () => void }) {
  const { t } = useT();
  const when = ticket.lastReplyAt ?? ticket.createdAt;
  return (
    <button type="button" className="glass lvt-trow" aria-current={active} onClick={onSelect}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem" }}>
        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ticket.subject}
        </span>
        <PriorityBadge priority={ticket.priority} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem" }}>
        <StatusBadge status={ticket.status} />
        <span style={{ fontSize: ".72rem", color: "var(--muted)" }}>
          {ticket.lastReplyBy === "admin" ? t("Support replied") : t("Updated")} · {relativeTime(when, t)}
        </span>
      </div>
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────────── */
export function SupportPage() {
  const { t } = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const { data: tickets, isLoading, isError } = useQuery<TicketSummary[], ApiError>({
    queryKey: ["support-tickets"],
    queryFn: () => api.get<TicketSummary[]>("/api/v1/support/tickets"),
  });

  const panelActive = composing || selectedId !== null;

  return (
    <AppShell title={t("Support")}>
      <style>{ticketCss}</style>
      <style>{pageCss}</style>

      <div className="lvt-sup" data-panel={panelActive}>
        {/* List column */}
        <div className="lvt-sup-list">
          <GlassButton
            type="button"
            onClick={() => { setComposing(true); setSelectedId(null); }}
            style={{ justifyContent: "center" }}
          >
            <Icon.Check aria-hidden="true" /> {t("New ticket")}
          </GlassButton>

          {isError ? (
            <GlassCard className="feature"><p className="body" role="alert" style={{ margin: 0 }}>{t("Could not load your tickets.")}</p></GlassCard>
          ) : isLoading ? (
            <GlassCard className="feature"><p className="body" style={{ margin: 0 }} aria-busy="true">{t("Loading…")}</p></GlassCard>
          ) : !tickets?.length ? (
            <GlassCard className="feature" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <p style={{ margin: "0 0 .35rem", fontWeight: 500 }}>{t("No tickets yet")}</p>
              <p className="body" style={{ margin: 0 }}>{t("Open your first ticket and we'll help you out.")}</p>
            </GlassCard>
          ) : (
            tickets.map((tk) => (
              <TicketRow
                key={tk.id}
                ticket={tk}
                active={tk.id === selectedId}
                onSelect={() => { setSelectedId(tk.id); setComposing(false); }}
              />
            ))
          )}
        </div>

        {/* Detail column */}
        <div className="lvt-sup-main">
          {composing ? (
            <NewTicket
              onCreated={(id) => { setComposing(false); setSelectedId(id); }}
              onCancel={() => setComposing(false)}
            />
          ) : selectedId ? (
            <Thread ticketId={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <GlassCard className="feature lvt-panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
              <p style={{ margin: "0 0 .35rem", fontWeight: 500 }}>{t("Your conversations")}</p>
              <p className="body" style={{ margin: 0 }}>
                {t("Select a ticket to read the thread, or open a new ticket.")}
              </p>
            </GlassCard>
          )}
        </div>
      </div>
    </AppShell>
  );
}

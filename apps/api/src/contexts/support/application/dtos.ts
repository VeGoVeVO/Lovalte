import type { Ticket, TicketMessage, TicketStatus, TicketPriority, AuthorKind } from "../domain/Ticket";

export interface TicketMessageDTO {
  id: string;
  authorKind: AuthorKind;
  authorEmail: string;
  body: string;
  createdAt: string;
}

export interface TicketSummaryDTO {
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

export interface TicketDetailDTO extends TicketSummaryDTO {
  messages: TicketMessageDTO[];
}

export interface TicketStatsDTO {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  total: number;
}

export function toMessageDTO(m: TicketMessage): TicketMessageDTO {
  return {
    id: m.id,
    authorKind: m.authorKind,
    authorEmail: m.authorEmail,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toSummaryDTO(t: Ticket): TicketSummaryDTO {
  return {
    id: t.id.value,
    tenantId: t.tenantId,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    createdByEmail: t.createdByEmail,
    lastReplyAt: t.lastReplyAt ? t.lastReplyAt.toISOString() : null,
    lastReplyBy: t.lastReplyBy,
    createdAt: t.createdAt.toISOString(),
  };
}

export function toDetailDTO(t: Ticket): TicketDetailDTO {
  return {
    ...toSummaryDTO(t),
    messages: t.messages.map(toMessageDTO),
  };
}

import { randomUUID } from "node:crypto";
import { AggregateRoot, ValidationError } from "../../../kernel";
import { TicketId } from "./TicketId";

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type AuthorKind = "user" | "admin";

export const TICKET_STATUSES: readonly TicketStatus[] = ["open", "pending", "resolved", "closed"];
export const TICKET_PRIORITIES: readonly TicketPriority[] = ["low", "normal", "high", "urgent"];

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

/** An immutable message in a ticket thread. Identity = id; never edited once posted. */
export interface TicketMessage {
  readonly id: string;
  readonly authorKind: AuthorKind;
  readonly authorId: string | null; // iam.users id for 'user'; null for the platform admin
  readonly authorEmail: string;
  readonly body: string;
  readonly createdAt: Date;
}

interface TicketProps {
  tenantId: string;
  createdBy: string;
  createdByEmail: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  messages: TicketMessage[];
  lastReplyAt: Date | null;
  lastReplyBy: AuthorKind | null;
  createdAt: Date;
  updatedAt: Date;
}

function cleanText(raw: string, max: number, field: string): string {
  const v = raw.trim();
  if (v.length === 0) throw new ValidationError(`${field} is required`);
  if (v.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return v;
}

/**
 * Ticket aggregate root.
 * Consistency boundary = the ticket + its message thread.
 * Invariants:
 *   - subject 1..200, every message body 1..5000 (enforced here, mirrored in DB CHECKs).
 *   - a closed ticket cannot receive new messages (reopen via status change first).
 *   - messages are append-only (no edit/delete in the model or the DB).
 * Emits: TicketOpened, TicketReplied (for future notification subscribers).
 */
export class Ticket extends AggregateRoot<TicketId> {
  /** Messages added in-memory but not yet persisted (mirrors the events pattern). */
  private readonly _newMessages: TicketMessage[] = [];

  private constructor(id: TicketId, private readonly props: TicketProps) {
    super(id);
  }

  /** Open a brand-new ticket with its first message. */
  static open(params: {
    tenantId: string;
    createdBy: string;
    createdByEmail: string;
    subject: string;
    body: string;
    priority?: TicketPriority;
  }): Ticket {
    const subject = cleanText(params.subject, SUBJECT_MAX, "Subject");
    const body = cleanText(params.body, BODY_MAX, "Message");
    const now = new Date();
    const first: TicketMessage = {
      id: randomUUID(),
      authorKind: "user",
      authorId: params.createdBy,
      authorEmail: params.createdByEmail,
      body,
      createdAt: now,
    };
    const ticket = new Ticket(TicketId.create(), {
      tenantId: params.tenantId,
      createdBy: params.createdBy,
      createdByEmail: params.createdByEmail,
      subject,
      status: "open",
      priority: params.priority ?? "normal",
      messages: [first],
      lastReplyAt: now,
      lastReplyBy: "user",
      createdAt: now,
      updatedAt: now,
    });
    ticket._newMessages.push(first);
    ticket.addEvent(
      ticket.makeEvent("TicketOpened", {
        ticketId: ticket.id.value,
        tenantId: params.tenantId,
        subject,
      })
    );
    return ticket;
  }

  /** Reconstitute from persistence - no events, no pending messages. */
  static reconstitute(id: string, props: TicketProps): Ticket {
    return new Ticket(TicketId.from(id), props);
  }

  /** Append a reply from a tenant user or the platform admin. */
  reply(params: { authorKind: AuthorKind; authorId: string | null; authorEmail: string; body: string }): TicketMessage {
    if (this.props.status === "closed") {
      throw new ValidationError("This ticket is closed and cannot accept new replies");
    }
    const body = cleanText(params.body, BODY_MAX, "Message");
    const now = new Date();
    const msg: TicketMessage = {
      id: randomUUID(),
      authorKind: params.authorKind,
      authorId: params.authorId,
      authorEmail: params.authorEmail,
      body,
      createdAt: now,
    };
    this.props.messages.push(msg);
    this._newMessages.push(msg);
    this.props.lastReplyAt = now;
    this.props.lastReplyBy = params.authorKind;
    this.props.updatedAt = now;

    // Natural helpdesk transitions: admin answering an open ticket moves it to
    // "pending" (awaiting the customer); a user replying to a resolved ticket reopens it.
    if (params.authorKind === "admin" && this.props.status === "open") {
      this.props.status = "pending";
    } else if (params.authorKind === "user" && this.props.status === "resolved") {
      this.props.status = "open";
    }

    this.addEvent(
      this.makeEvent("TicketReplied", {
        ticketId: this.id.value,
        tenantId: this.props.tenantId,
        authorKind: params.authorKind,
      })
    );
    return msg;
  }

  changeStatus(status: TicketStatus): void {
    if (!TICKET_STATUSES.includes(status)) throw new ValidationError("Invalid ticket status");
    this.props.status = status;
    this.props.updatedAt = new Date();
  }

  changePriority(priority: TicketPriority): void {
    if (!TICKET_PRIORITIES.includes(priority)) throw new ValidationError("Invalid ticket priority");
    this.props.priority = priority;
    this.props.updatedAt = new Date();
  }

  /** Pull messages added since load/open, for the repository to insert. */
  pullNewMessages(): TicketMessage[] {
    const out = this._newMessages.splice(0, this._newMessages.length);
    return out;
  }

  get tenantId(): string { return this.props.tenantId; }
  get createdBy(): string { return this.props.createdBy; }
  get createdByEmail(): string { return this.props.createdByEmail; }
  get subject(): string { return this.props.subject; }
  get status(): TicketStatus { return this.props.status; }
  get priority(): TicketPriority { return this.props.priority; }
  get messages(): readonly TicketMessage[] { return this.props.messages; }
  get lastReplyAt(): Date | null { return this.props.lastReplyAt; }
  get lastReplyBy(): AuthorKind | null { return this.props.lastReplyBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}

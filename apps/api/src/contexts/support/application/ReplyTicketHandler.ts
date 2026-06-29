import { DomainError, NotFoundError, ok, err } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import type { ITicketRepository } from "../domain/ports";
import { toDetailDTO, type TicketDetailDTO } from "./dtos";

export interface ReplyTicketInput {
  ticketId: string;
  tenantId: string;
  authorId: string;
  authorEmail: string;
  body: string;
}

/** Command: a tenant user posts a reply on one of their tickets. */
export class ReplyTicketHandler {
  constructor(
    private readonly tickets: ITicketRepository,
    private readonly bus: DomainEventBus
  ) {}

  async execute(input: ReplyTicketInput): Promise<Result<TicketDetailDTO>> {
    try {
      const ticket = await this.tickets.findByIdForTenant(input.ticketId, input.tenantId);
      if (!ticket) return err(new NotFoundError("Ticket not found"));
      ticket.reply({
        authorKind: "user",
        authorId: input.authorId,
        authorEmail: input.authorEmail,
        body: input.body,
      });
      await this.tickets.save(ticket);
      const events = ticket.pullEvents();
      if (events.length > 0) await this.bus.publish(events);
      return ok(toDetailDTO(ticket));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

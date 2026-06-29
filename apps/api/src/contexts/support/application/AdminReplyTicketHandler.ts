import { DomainError, NotFoundError, ok, err } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import type { ITicketRepository } from "../domain/ports";
import { toDetailDTO, type TicketDetailDTO } from "./dtos";

export interface AdminReplyTicketInput {
  ticketId: string;
  authorEmail: string; // the admin's email, for thread attribution
  body: string;
}

/** Command (admin): post a reply on any tenant's ticket. */
export class AdminReplyTicketHandler {
  constructor(
    private readonly tickets: ITicketRepository,
    private readonly bus: DomainEventBus
  ) {}

  async execute(input: AdminReplyTicketInput): Promise<Result<TicketDetailDTO>> {
    try {
      const ticket = await this.tickets.findByIdAsAdmin(input.ticketId);
      if (!ticket) return err(new NotFoundError("Ticket not found"));
      ticket.reply({
        authorKind: "admin",
        authorId: null,
        authorEmail: input.authorEmail,
        body: input.body,
      });
      await this.tickets.saveAsAdmin(ticket);
      const events = ticket.pullEvents();
      if (events.length > 0) await this.bus.publish(events);
      return ok(toDetailDTO(ticket));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

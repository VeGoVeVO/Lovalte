import { DomainError, NotFoundError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { ITicketRepository } from "../domain/ports";
import type { TicketStatus, TicketPriority } from "../domain/Ticket";
import { toDetailDTO, type TicketDetailDTO } from "./dtos";

export interface AdminUpdateTicketInput {
  ticketId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
}

/** Command (admin): change a ticket's status and/or priority. */
export class AdminUpdateTicketHandler {
  constructor(private readonly tickets: ITicketRepository) {}

  async execute(input: AdminUpdateTicketInput): Promise<Result<TicketDetailDTO>> {
    try {
      const ticket = await this.tickets.findByIdAsAdmin(input.ticketId);
      if (!ticket) return err(new NotFoundError("Ticket not found"));
      if (input.status) ticket.changeStatus(input.status);
      if (input.priority) ticket.changePriority(input.priority);
      await this.tickets.saveAsAdmin(ticket);
      return ok(toDetailDTO(ticket));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

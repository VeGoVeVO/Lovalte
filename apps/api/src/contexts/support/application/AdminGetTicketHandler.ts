import { DomainError, NotFoundError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { ITicketRepository } from "../domain/ports";
import { toDetailDTO, type TicketDetailDTO } from "./dtos";

/** Query (admin): one ticket + full thread, any tenant. */
export class AdminGetTicketHandler {
  constructor(private readonly tickets: ITicketRepository) {}

  async execute(ticketId: string): Promise<Result<TicketDetailDTO>> {
    try {
      const ticket = await this.tickets.findByIdAsAdmin(ticketId);
      if (!ticket) return err(new NotFoundError("Ticket not found"));
      return ok(toDetailDTO(ticket));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

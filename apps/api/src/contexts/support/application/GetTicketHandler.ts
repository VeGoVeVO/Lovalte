import { DomainError, NotFoundError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { ITicketRepository } from "../domain/ports";
import { toDetailDTO, type TicketDetailDTO } from "./dtos";

export interface GetTicketInput {
  ticketId: string;
  tenantId: string;
}

/** Query: one ticket + its full thread, scoped to the calling tenant. */
export class GetTicketHandler {
  constructor(private readonly tickets: ITicketRepository) {}

  async execute(input: GetTicketInput): Promise<Result<TicketDetailDTO>> {
    try {
      const ticket = await this.tickets.findByIdForTenant(input.ticketId, input.tenantId);
      if (!ticket) return err(new NotFoundError("Ticket not found"));
      return ok(toDetailDTO(ticket));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

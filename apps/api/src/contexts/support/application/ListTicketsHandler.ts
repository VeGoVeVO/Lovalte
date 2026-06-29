import { DomainError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { ITicketRepository } from "../domain/ports";
import { toSummaryDTO, type TicketSummaryDTO } from "./dtos";

/** Query: list the calling tenant's tickets (newest activity first). */
export class ListTicketsHandler {
  constructor(private readonly tickets: ITicketRepository) {}

  async execute(tenantId: string): Promise<Result<TicketSummaryDTO[]>> {
    try {
      const list = await this.tickets.listByTenant(tenantId);
      return ok(list.map(toSummaryDTO));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

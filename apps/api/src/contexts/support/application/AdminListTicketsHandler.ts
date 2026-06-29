import { DomainError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { ITicketRepository, TicketListFilter } from "../domain/ports";
import { toSummaryDTO, type TicketSummaryDTO } from "./dtos";

/** Query (admin): list tickets across ALL tenants, optionally filtered. */
export class AdminListTicketsHandler {
  constructor(private readonly tickets: ITicketRepository) {}

  async execute(filter: TicketListFilter): Promise<Result<TicketSummaryDTO[]>> {
    try {
      const list = await this.tickets.listAllAsAdmin(filter);
      return ok(list.map(toSummaryDTO));
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

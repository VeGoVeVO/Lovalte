import { DomainError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { ITicketRepository } from "../domain/ports";
import type { TicketStatsDTO } from "./dtos";

/** Query (admin): ticket counts by status across all tenants (desk KPIs). */
export class AdminStatsHandler {
  constructor(private readonly tickets: ITicketRepository) {}

  async execute(): Promise<Result<TicketStatsDTO>> {
    try {
      const counts = await this.tickets.countByStatusAsAdmin();
      const stats: TicketStatsDTO = { open: 0, pending: 0, resolved: 0, closed: 0, total: 0 };
      for (const c of counts) {
        stats[c.status] = c.count;
        stats.total += c.count;
      }
      return ok(stats);
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}

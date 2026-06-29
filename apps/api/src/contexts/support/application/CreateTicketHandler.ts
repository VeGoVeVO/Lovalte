import { DomainError, ok, err } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import { Ticket, type TicketPriority } from "../domain/Ticket";
import type { ITicketRepository } from "../domain/ports";
import { toDetailDTO, type TicketDetailDTO } from "./dtos";

export interface CreateTicketInput {
  tenantId: string;
  createdBy: string;
  createdByEmail: string;
  subject: string;
  body: string;
  priority?: TicketPriority;
}

/** Command: a tenant user opens a new support ticket (with its first message). */
export class CreateTicketHandler {
  constructor(
    private readonly tickets: ITicketRepository,
    private readonly bus: DomainEventBus
  ) {}

  async execute(input: CreateTicketInput): Promise<Result<TicketDetailDTO>> {
    try {
      const ticket = Ticket.open({
        tenantId: input.tenantId,
        createdBy: input.createdBy,
        createdByEmail: input.createdByEmail,
        subject: input.subject,
        body: input.body,
        priority: input.priority,
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

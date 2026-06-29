import { UniqueId } from "../../../kernel";
import { randomUUID } from "node:crypto";

/** Identity value object for the Ticket aggregate. */
export class TicketId extends UniqueId {
  static override create(): TicketId {
    return new TicketId(randomUUID());
  }

  static override from(value: string): TicketId {
    return new TicketId(value);
  }
}

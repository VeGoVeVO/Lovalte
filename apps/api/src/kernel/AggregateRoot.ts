import { Entity } from "./Entity";
import { UniqueId } from "./Id";
import { DomainEvent } from "./DomainEvent";

/** Aggregate root: the only entry point to its consistency boundary. Records
 *  domain events; the application layer pulls and publishes them after commit. */
export abstract class AggregateRoot<TId extends UniqueId = UniqueId> extends Entity<TId> {
  private _events: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this._events.push(event);
  }

  pullEvents(): DomainEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  protected makeEvent(name: string, payload: Record<string, unknown>): DomainEvent {
    return { name, occurredAt: new Date(), aggregateId: this.id.toString(), payload };
  }
}

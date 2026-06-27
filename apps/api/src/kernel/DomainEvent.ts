/** A fact that happened in the domain. Carries ids only (never other aggregates). */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}

export type DomainEventHandler = (event: DomainEvent) => Promise<void> | void;

/** Contexts integrate ONLY through this bus — never by importing each other's domain. */
export interface DomainEventBus {
  publish(events: DomainEvent[]): Promise<void>;
  subscribe(eventName: string, handler: DomainEventHandler): void;
}

import type { DomainEvent, DomainEventBus, DomainEventHandler } from "../kernel";

/** In-process synchronous event bus for intra-monolith context integration.
 *  ponytail: swap for a BullMQ-backed bus (research 06/plan 10) when contexts
 *  move to separate workers - the DomainEventBus port stays identical. */
export class InMemoryEventBus implements DomainEventBus {
  private handlers = new Map<string, DomainEventHandler[]>();

  subscribe(eventName: string, handler: DomainEventHandler): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const list = this.handlers.get(event.name) ?? [];
      for (const handler of list) {
        try {
          await handler(event);
        } catch (err) {
          // Isolate subscribers: a failing side effect (APNs push, re-sign,
          // projection) must not break the publishing command or sibling
          // subscribers. Log and continue. ponytail: swap for an outbox + retry
          // when contexts move to a real broker.
          console.error(`[event-bus] subscriber for "${event.name}" failed:`, err);
        }
      }
    }
  }
}

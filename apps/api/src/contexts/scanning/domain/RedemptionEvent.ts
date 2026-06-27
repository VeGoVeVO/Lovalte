import { randomUUID } from "node:crypto";
import { AggregateRoot, UniqueId } from "../../../kernel";

/** award = add points, redeem = subtract points */
export type ScanAction = "award" | "redeem";

export class RedemptionEventId extends UniqueId {
  static override create(): RedemptionEventId {
    return new RedemptionEventId(randomUUID());
  }
  static override from(value: string): RedemptionEventId {
    return new RedemptionEventId(value);
  }
}

interface RedemptionEventProps {
  readonly tenantId: string;
  readonly passId: string;
  readonly action: ScanAction;
  /** Positive for award, negative for redeem. */
  readonly delta: number;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

/**
 * Append-only record of one completed QR scan outcome.
 * Persisted once; never updated or deleted.
 * Emits RedemptionApplied so the Membership context can award/redeem points.
 */
export class RedemptionEvent extends AggregateRoot<RedemptionEventId> {
  private constructor(
    id: RedemptionEventId,
    private readonly props: RedemptionEventProps,
  ) {
    super(id);
  }

  /** Factory - records the event and queues the RedemptionApplied domain event. */
  static record(params: {
    tenantId: string;
    passId: string;
    action: ScanAction;
    delta: number;
    idempotencyKey: string;
    createdAt: Date;
  }): RedemptionEvent {
    const id = RedemptionEventId.create();
    const evt = new RedemptionEvent(id, { ...params });
    evt.addEvent(
      evt.makeEvent("RedemptionApplied", {
        passId: params.passId,
        tenantId: params.tenantId,
        delta: params.delta,
        action: params.action as string,
      }),
    );
    return evt;
  }

  /** Rehydrate from persistence - no events emitted. */
  static reconstitute(params: {
    id: string;
    tenantId: string;
    passId: string;
    action: ScanAction;
    delta: number;
    idempotencyKey: string;
    createdAt: Date;
  }): RedemptionEvent {
    return new RedemptionEvent(RedemptionEventId.from(params.id), {
      tenantId: params.tenantId,
      passId: params.passId,
      action: params.action,
      delta: params.delta,
      idempotencyKey: params.idempotencyKey,
      createdAt: params.createdAt,
    });
  }

  get tenantId(): string { return this.props.tenantId; }
  get passId(): string { return this.props.passId; }
  get action(): ScanAction { return this.props.action; }
  get delta(): number { return this.props.delta; }
  get idempotencyKey(): string { return this.props.idempotencyKey; }
  get createdAt(): Date { return this.props.createdAt; }
}

import type { DomainEventBus, Clock, Result } from "../../../kernel";
import { ok, err, NotFoundError, ValidationError } from "../../../kernel";
import { RedemptionEvent, type ScanAction } from "../domain/RedemptionEvent";
import type { IRedemptionEventRepository, IPassLookup, ICacheStore } from "./ports";

export interface RedeemScanCommand {
  readonly qrPayload: string;
  readonly action: ScanAction;
  /** Always positive; handler applies sign based on action. */
  readonly amount: number;
  readonly idempotencyKey: string;
  /** tenantId from the caller's session - used for tenant isolation check. */
  readonly callerTenantId: string;
  readonly staffUserId: string;
}

export interface RedeemScanDTO {
  readonly eventId: string;
  readonly passId: string;
  readonly action: ScanAction;
  /** Positive for award, negative for redeem. */
  readonly delta: number;
}

const IDEM_TTL_SECONDS = 30; // 30 s window to absorb double-taps / network retries
const IDEM_KEY_PREFIX = "scan:idem:";

/** A wallet barcode is a passId (UUID). Reject anything that can't be one. */
const PASS_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

/**
 * RedeemScanHandler - orchestrates the full scan-to-award/redeem flow.
 *
 * The wallet barcode carries only the passId (industry standard for loyalty
 * cards). Guard order:
 *  1. Resolve + tenant-isolate: the pass must belong to the authenticated
 *     caller's tenant (RLS-scoped lookup - a foreign or unknown card is rejected).
 *  2. Idempotency guard (30 s) - absorb double-taps / retries.
 *  3. Persist RedemptionEvent → cache result → publish RedemptionApplied.
 *
 * The loyalty card's QR is intentionally REUSABLE (scanned every visit), so
 * there is no single-use nonce. ponytail: add a per-member per-visit cooldown
 * here if point-farming becomes a concern (a business rule).
 */
export class RedeemScanHandler {
  constructor(
    private readonly repo: IRedemptionEventRepository,
    private readonly passes: IPassLookup,
    private readonly cache: ICacheStore,
    private readonly bus: DomainEventBus,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: RedeemScanCommand): Promise<Result<RedeemScanDTO>> {
    // Input guard
    if (cmd.amount <= 0) {
      return err(new ValidationError("amount must be a positive integer"));
    }

    // 1. The barcode is the passId. Validate shape, then resolve it scoped to the
    //    caller's tenant - this both looks it up and enforces tenant isolation:
    //    a pass from another business is invisible under RLS → "card not found".
    const passId = cmd.qrPayload.trim();
    if (!PASS_ID_RE.test(passId)) {
      return err(new ValidationError("Unrecognized QR code"));
    }
    const belongs = await this.passes.existsForTenant(passId, cmd.callerTenantId);
    if (!belongs) {
      return err(new NotFoundError("Card not found for this business"));
    }

    // 2. Idempotency guard - absorb double-taps / retries within 30 s
    const idemKey = `${IDEM_KEY_PREFIX}${cmd.idempotencyKey}`;
    const cached = await this.cache.get(idemKey);
    if (cached !== null) {
      return ok(JSON.parse(cached) as RedeemScanDTO);
    }

    // 3. Persist the append-only redemption event
    const delta = cmd.action === "award" ? cmd.amount : -cmd.amount;
    const evt = RedemptionEvent.record({
      tenantId: cmd.callerTenantId,
      passId,
      action: cmd.action,
      delta,
      idempotencyKey: cmd.idempotencyKey,
      createdAt: this.clock.now(),
    });

    await this.repo.save(evt);

    // 4. Cache result for the idempotency window
    const result: RedeemScanDTO = {
      eventId: evt.id.value,
      passId,
      action: cmd.action,
      delta: evt.delta,
    };
    await this.cache.set(idemKey, JSON.stringify(result), IDEM_TTL_SECONDS);

    // 5. Publish domain events (RedemptionApplied → Membership context)
    await this.bus.publish(evt.pullEvents());

    return ok(result);
  }
}

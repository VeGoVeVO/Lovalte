import type { DomainEventBus, Clock, Result } from "../../../kernel";
import { ok, err, DomainError, ForbiddenError, ValidationError } from "../../../kernel";
import { RedemptionEvent, type ScanAction } from "../domain/RedemptionEvent";
import type { IRedemptionEventRepository, IQrVerifier, ICacheStore } from "./ports";

export interface RedeemScanCommand {
  readonly qrPayload: string;
  readonly action: ScanAction;
  /** Always positive; handler applies sign based on action. */
  readonly amount: number;
  readonly idempotencyKey: string;
  /** tenantId from the caller's session — used for tenant isolation check. */
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

const IDEM_TTL_SECONDS = 30;         // 30 s window to absorb double-taps / network retries
const IDEM_KEY_PREFIX = "scan:idem:";

/**
 * RedeemScanHandler — orchestrates the full scan-to-award/redeem flow.
 *
 * Guard order (per security threat model):
 *  1. HMAC signature verification
 *  2. Tenant isolation check (token.tenantId must match caller session)
 *  3. Idempotency guard (30-second Redis NX) — double-tap / retry safety
 *  4. Persist RedemptionEvent
 *  5. Cache result for the idempotency window
 *  6. Publish RedemptionApplied for Membership context
 *
 * The loyalty card's wallet QR is intentionally REUSABLE (scanned every visit),
 * so there is no single-use nonce guard. ponytail: add a per-member per-visit
 * cooldown here if point-farming becomes a concern (a business rule).
 */
export class RedeemScanHandler {
  constructor(
    private readonly repo: IRedemptionEventRepository,
    private readonly verifier: IQrVerifier,
    private readonly cache: ICacheStore,
    private readonly bus: DomainEventBus,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: RedeemScanCommand): Promise<Result<RedeemScanDTO>> {
    // Input guard
    if (cmd.amount <= 0) {
      return err(new ValidationError("amount must be a positive integer"));
    }

    // 1. Verify QR token HS256 signature; parse claims
    let token: Awaited<ReturnType<IQrVerifier["verify"]>>;
    try {
      token = await this.verifier.verify(cmd.qrPayload);
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      return err(new ValidationError("Invalid QR token"));
    }

    // 2. Tenant isolation — tid in token must match the authenticated session
    if (token.tenantId !== cmd.callerTenantId) {
      return err(new ForbiddenError("QR token tenant mismatch"));
    }

    // 3. Idempotency guard — absorb double-taps / retries within 30 s
    const idemKey = `${IDEM_KEY_PREFIX}${cmd.idempotencyKey}`;
    const cached = await this.cache.get(idemKey);
    if (cached !== null) {
      return ok(JSON.parse(cached) as RedeemScanDTO);
    }

    // 5. Persist the append-only redemption event
    const delta = cmd.action === "award" ? cmd.amount : -cmd.amount;
    const evt = RedemptionEvent.record({
      tenantId: cmd.callerTenantId,
      passId: token.passId,
      action: cmd.action,
      delta,
      idempotencyKey: cmd.idempotencyKey,
      createdAt: this.clock.now(),
    });

    await this.repo.save(evt);

    // 6. Cache result for the idempotency window
    const result: RedeemScanDTO = {
      eventId: evt.id.value,
      passId: token.passId,
      action: cmd.action,
      delta: evt.delta,
    };
    await this.cache.set(idemKey, JSON.stringify(result), IDEM_TTL_SECONDS);

    // 7. Publish domain events (RedemptionApplied → Membership context)
    await this.bus.publish(evt.pullEvents());

    return ok(result);
  }
}

import type { ContextModule } from "../../http/app";
import { MemberRepository } from "./infrastructure/MemberRepository";
import { LedgerRepository } from "./infrastructure/LedgerRepository";
import { TierRepository } from "./infrastructure/TierRepository";
import { EnrollMemberHandler } from "./application/EnrollMemberHandler";
import { GetMemberHandler } from "./application/GetMemberHandler";
import { GetMemberActivityHandler } from "./application/GetMemberActivityHandler";
import { ApplyPointsHandler } from "./application/ApplyPointsHandler";
import { ListMembersHandler } from "./application/ListMembersHandler";
import { registerMemberRoutes } from "./presentation/routes";

/**
 * Membership / Loyalty bounded context.
 *
 * Subscribes to:
 *   - "PassIssued"        → EnrollMemberHandler  (idempotent)
 *   - "RedemptionApplied" → ApplyPointsHandler
 *
 * Publishes:
 *   - "MemberEnrolled"
 *   - "PointsEarned"
 *   - "TierUpgraded"
 */
export const registerMembership: ContextModule = async (app, deps) => {
  // ── Infrastructure ─────────────────────────────────────────────────────────
  const memberRepo = new MemberRepository(deps.pool);
  const ledgerRepo = new LedgerRepository(deps.pool);
  const tierRepo = new TierRepository(deps.pool);

  // ── Application handlers ───────────────────────────────────────────────────
  const enrollMember = new EnrollMemberHandler(memberRepo, deps.bus);
  const getMember = new GetMemberHandler(memberRepo);
  const getMemberActivity = new GetMemberActivityHandler(memberRepo, ledgerRepo);
  const listMembers = new ListMembersHandler(memberRepo);
  const applyPoints = new ApplyPointsHandler(memberRepo, ledgerRepo, tierRepo, deps.bus);

  // ── Cross-context subscriptions ────────────────────────────────────────────

  // PassIssued (from Pass Issuance context) → enrol a new member.
  deps.bus.subscribe("PassIssued", async (event) => {
    const payload = event.payload as {
      passId: string;
      tenantId: string;
      displayName?: string | null;
      email?: string | null;
    };
    await enrollMember.execute({
      passId: payload.passId,
      tenantId: payload.tenantId,
      displayName: payload.displayName,
      email: payload.email,
    });
  });

  // RedemptionApplied (from Scanning & Redemption context) → award/redeem points.
  // The scan identifies the card by passId (the wallet barcode), so resolve the
  // member it enrolled, then apply the points delta to that member.
  deps.bus.subscribe("RedemptionApplied", async (event) => {
    const payload = event.payload as {
      passId: string;
      tenantId: string;
      delta: number;
      action: string;
    };
    const member = await memberRepo.findByPassId(payload.passId, payload.tenantId);
    if (!member) {
      app.log.warn({ passId: payload.passId }, "RedemptionApplied: no member for passId");
      return;
    }
    const r = await applyPoints.execute({
      memberId: member.id.value,
      tenantId: payload.tenantId,
      delta: payload.delta,
      reason: payload.action,
      referenceId: payload.passId,
    });
    if (!r.ok) {
      app.log.error(
        { err: r.error, passId: payload.passId },
        "ApplyPoints failed after RedemptionApplied",
      );
    }
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  registerMemberRoutes(app, deps, { getMember, getMemberActivity, listMembers });
};

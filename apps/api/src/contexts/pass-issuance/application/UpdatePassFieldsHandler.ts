import { NotFoundError, type Result, ok, err, type DomainEventBus, type Clock } from "../../../kernel";
import type { PassFieldValue } from "../domain/Pass";
import type { IPassRepository } from "../domain/ports";

export interface UpdatePassFieldsCommand {
  passId: string;
  tenantId: string;
  fieldValues: PassFieldValue[];
}

/**
 * UpdatePassFieldsHandler
 *
 * Updates the current field values on a Pass aggregate, bumps lastUpdated (monotonic),
 * and emits PassFieldsUpdated which the Delivery context uses to trigger APNs push.
 *
 * Used directly from routes (admin manual update) and indirectly from the
 * PointsEarned domain event subscription in index.ts.
 */
export class UpdatePassFieldsHandler {
  constructor(
    private readonly passes: IPassRepository,
    private readonly bus: DomainEventBus,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: UpdatePassFieldsCommand): Promise<Result<void>> {
    const pass = await this.passes.findById(cmd.passId, cmd.tenantId);
    if (!pass) return err(new NotFoundError("Pass not found"));

    pass.updateFields(cmd.fieldValues, this.clock.now());
    await this.passes.save(pass);
    await this.bus.publish(pass.pullEvents());

    return ok(undefined);
  }
}

// ── Convenience helper used by the PointsEarned event subscription ──────────

/**
 * Patch points-related fields in an existing fieldValues array.
 * Scans for keys named "points", "balance", or "tier" and updates their values.
 * Leaves all other field values unchanged.
 */
export function applyEarnedPoints(
  existing: PassFieldValue[],
  newBalance: number,
  newTier?: string,
): PassFieldValue[] {
  return existing.map(fv => {
    if (fv.key === "points" || fv.key === "balance") {
      return { ...fv, value: newBalance };
    }
    if (newTier && fv.key === "tier") {
      return { ...fv, value: newTier };
    }
    return fv;
  });
}

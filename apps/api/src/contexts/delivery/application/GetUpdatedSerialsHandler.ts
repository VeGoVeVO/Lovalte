import { Result, ok } from "../../../kernel";
import type { IRegistrationRepository } from "../domain/ports";

export interface GetUpdatedSerialsQuery {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  /**
   * Opaque epoch string sent back by the device from a prior `lastUpdated` value.
   * Absent on first call (device wants ALL registered serials).
   */
  passesUpdatedSince?: string;
}

export interface UpdatedSerialsDTO {
  serialNumbers: string[];
  /** Millisecond epoch string. Device echoes this as `passesUpdatedSince` on the next poll. */
  lastUpdated: string;
}

/** A value below this is treated as legacy seconds (pre-millisecond-precision tags) and upscaled. */
const LEGACY_SECONDS_CEILING = 1e12;

/**
 * Apple PassKit web-service endpoint 9.2 (no auth required per spec).
 * Returns the serial numbers of passes updated after the supplied tag.
 * The tag is a millisecond epoch (accepts legacy second-precision tags for
 * backward compatibility with devices that cached an older tag format).
 * Returns null (→ 204 No Content) when nothing has changed.
 */
export class GetUpdatedSerialsHandler {
  constructor(private readonly registrations: IRegistrationRepository) {}

  async execute(q: GetUpdatedSerialsQuery): Promise<Result<UpdatedSerialsDTO | null, never>> {
    let sinceMs: number | undefined;
    if (q.passesUpdatedSince) {
      const n = Number(q.passesUpdatedSince);
      if (Number.isFinite(n)) {
        sinceMs = n < LEGACY_SECONDS_CEILING ? n * 1000 : n;
      }
    }

    const rows = await this.registrations.findUpdatedSince(
      q.deviceLibraryIdentifier,
      q.passTypeIdentifier,
      sinceMs,
    );

    if (rows.length === 0) return ok(null);

    const maxUpdatedAt = rows.reduce(
      (max, r) => (r.updatedAt > max ? r.updatedAt : max),
      rows[0].updatedAt,
    );
    // Millisecond precision + the repository's strict `>` comparison guarantee
    // an unchanged pass is never returned again for this exact tag.
    const lastUpdated = String(maxUpdatedAt.getTime());

    return ok({
      serialNumbers: rows.map((r) => r.serialNumber),
      lastUpdated,
    });
  }
}

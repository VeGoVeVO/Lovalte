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
  /** Epoch string (seconds). Device echoes this as `passesUpdatedSince` on the next poll. */
  lastUpdated: string;
}

/**
 * Apple PassKit web-service endpoint 9.2 (no auth required per spec).
 * Returns the serial numbers of passes updated after the supplied epoch tag.
 * Returns null (→ 204 No Content) when nothing has changed.
 */
export class GetUpdatedSerialsHandler {
  constructor(private readonly registrations: IRegistrationRepository) {}

  async execute(q: GetUpdatedSerialsQuery): Promise<Result<UpdatedSerialsDTO | null, never>> {
    let since: Date | undefined;
    if (q.passesUpdatedSince) {
      const epoch = Number(q.passesUpdatedSince);
      since = Number.isFinite(epoch) ? new Date(epoch * 1000) : new Date(q.passesUpdatedSince);
      if (Number.isNaN(since.getTime())) {
        since = undefined;
      }
    }

    const rows = await this.registrations.findUpdatedSince(
      q.deviceLibraryIdentifier,
      q.passTypeIdentifier,
      since,
    );

    if (rows.length === 0) return ok(null);

    const maxUpdatedAt = rows.reduce(
      (max, r) => (r.updatedAt > max ? r.updatedAt : max),
      rows[0].updatedAt,
    );
    const lastUpdated = String(Math.floor(maxUpdatedAt.getTime() / 1000));

    return ok({
      serialNumbers: rows.map((r) => r.serialNumber),
      lastUpdated,
    });
  }
}

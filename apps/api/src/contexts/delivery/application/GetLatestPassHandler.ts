import { Result, ok } from "../../../kernel";
import { constantTimeEquals } from "../domain/constantTimeEquals";
import type {
  IPassReadPort,
  IPassBinaryPort,
  IPassResignPort,
  IRegistrationRepository,
} from "../domain/ports";

export interface GetLatestPassQuery {
  serialNumber: string;
  passTypeIdentifier: string;
  /** Raw token from `Authorization: ApplePass <token>` header. */
  authToken: string;
  /** Value of the `If-Modified-Since` request header, if present. */
  ifModifiedSince?: string;
}

export type GetLatestPassResult =
  { status: 304 } | { status: 401 } | { status: 200; lastModified: string; buffer: Buffer | null };

/** Floor a Date to whole seconds - If-Modified-Since has only second precision. */
function floorToSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/**
 * Apple PassKit web-service endpoint 9.3.
 * Validates the auth token and passTypeIdentifier, honours If-Modified-Since,
 * and serves the signed .pkpass buffer from the shared cache (via
 * IPassBinaryPort). On a cache miss, asks IPassResignPort to re-sign once
 * before giving up; the route layer 503s only if that also comes back empty.
 */
export class GetLatestPassHandler {
  constructor(
    private readonly passes: IPassReadPort,
    private readonly binary: IPassBinaryPort,
    private readonly resign: IPassResignPort,
    private readonly registrations: IRegistrationRepository,
  ) {}

  async execute(q: GetLatestPassQuery): Promise<Result<GetLatestPassResult, never>> {
    const pass = await this.passes.findBySerial(q.serialNumber);
    if (!pass || !constantTimeEquals(pass.authenticationToken, q.authToken)) {
      return ok({ status: 401 });
    }
    if (!constantTimeEquals(pass.passTypeIdentifier, q.passTypeIdentifier)) {
      return ok({ status: 401 });
    }

    if (q.ifModifiedSince) {
      const since = new Date(q.ifModifiedSince);
      if (!Number.isNaN(since.getTime()) && floorToSeconds(pass.updatedAt) <= floorToSeconds(since)) {
        return ok({ status: 304 });
      }
    }

    let buffer = await this.binary.get(pass.serialNumber, pass.version);
    if (!buffer) {
      buffer = await this.resign.ensureCached(pass.serialNumber);
    }

    if (buffer) {
      await this.registrations.touchLastFetchedByPass(pass.id);
    }

    return ok({
      status: 200,
      lastModified: pass.updatedAt.toUTCString(),
      buffer,
    });
  }
}

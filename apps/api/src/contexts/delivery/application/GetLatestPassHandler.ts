import { Result, ok } from "../../../kernel";
import type { IPassReadPort, IPassBinaryPort } from "../domain/ports";

export interface GetLatestPassQuery {
  serialNumber: string;
  passTypeIdentifier: string;
  /** Raw token from `Authorization: ApplePass <token>` header. */
  authToken: string;
  /** Value of the `If-Modified-Since` request header, if present. */
  ifModifiedSince?: string;
}

export type GetLatestPassResult =
  | { status: 304 }
  | { status: 401 }
  | { status: 200; lastModified: string; buffer: Buffer | null };

/**
 * Apple PassKit web-service endpoint 9.3.
 * Validates the auth token, honours If-Modified-Since, and serves the signed
 * .pkpass buffer from S3 cache (via IPassBinaryPort).
 * If the S3 key exists but the binary adapter returns null (cache miss), the
 * route layer returns 503; re-signing belongs to the pass-issuance context.
 */
export class GetLatestPassHandler {
  constructor(
    private readonly passes: IPassReadPort,
    private readonly binary: IPassBinaryPort,
  ) {}

  async execute(q: GetLatestPassQuery): Promise<Result<GetLatestPassResult, never>> {
    const pass = await this.passes.findBySerial(q.serialNumber);
    if (!pass || pass.authenticationToken !== q.authToken) {
      return ok({ status: 401 });
    }

    if (q.ifModifiedSince) {
      const since = new Date(q.ifModifiedSince);
      if (!Number.isNaN(since.getTime()) && pass.updatedAt <= since) {
        return ok({ status: 304 });
      }
    }

    const buffer = await this.binary.get(pass.serialNumber, pass.version);

    return ok({
      status: 200,
      lastModified: pass.updatedAt.toUTCString(),
      buffer,
    });
  }
}

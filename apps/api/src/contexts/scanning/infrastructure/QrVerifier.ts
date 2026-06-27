import crypto from "node:crypto";
import { ValidationError } from "../../../kernel";
import { QrToken } from "../domain/QrToken";
import type { IQrVerifier } from "../application/ports";

/** Shape of the decoded JWT payload for QR tokens. */
interface QrJwtClaims {
  sub?: unknown;   // passId
  tid?: unknown;   // tenantId
  nce?: unknown;   // nonce
  iat?: unknown;   // issued-at seconds
  exp?: unknown;   // expiry seconds
}

/**
 * Verifies compact HS256 JWTs issued by QrTokenFactory at pass issuance time.
 *
 * Algorithm: HMAC-SHA256 over "<base64url(header)>.<base64url(payload)>".
 * Uses node:crypto only — no external JWT library required.
 *
 * Security notes:
 *  - timingSafeEqual prevents timing-based signature attacks.
 *  - Length checked before timingSafeEqual (required: equal-length buffers).
 *  - Expiry is validated, but the nonce Redis guard is the primary single-use control.
 */
export class QrVerifier implements IQrVerifier {
  constructor(private readonly secret: string) {}

  async verify(rawToken: string): Promise<QrToken> {
    const parts = rawToken.split(".");
    if (parts.length !== 3) {
      throw new ValidationError("Malformed QR token: expected 3 dot-separated parts");
    }

    const [header, payload, receivedSig] = parts as [string, string, string];

    // Recompute expected signature
    const signingInput = `${header}.${payload}`;
    const expectedSig = crypto
      .createHmac("sha256", this.secret)
      .update(signingInput)
      .digest("base64url");

    // Constant-time comparison — buffers must be equal length
    if (receivedSig.length !== expectedSig.length) {
      throw new ValidationError("Invalid QR token signature");
    }

    const sigOk = crypto.timingSafeEqual(
      Buffer.from(receivedSig, "utf8"),
      Buffer.from(expectedSig, "utf8"),
    );
    if (!sigOk) {
      throw new ValidationError("Invalid QR token signature");
    }

    // Decode and parse claims
    let claims: QrJwtClaims;
    try {
      const decoded = Buffer.from(payload, "base64url").toString("utf8");
      claims = JSON.parse(decoded) as QrJwtClaims;
    } catch {
      throw new ValidationError("Malformed QR token payload");
    }

    // Validate required claim types
    if (typeof claims.sub !== "string" || claims.sub.length === 0) {
      throw new ValidationError("QR token missing passId (sub)");
    }
    if (typeof claims.tid !== "string" || claims.tid.length === 0) {
      throw new ValidationError("QR token missing tenantId (tid)");
    }
    if (typeof claims.nce !== "string" || claims.nce.length === 0) {
      throw new ValidationError("QR token missing nonce (nce)");
    }
    if (typeof claims.iat !== "number") {
      throw new ValidationError("QR token missing iat");
    }
    if (typeof claims.exp !== "number") {
      throw new ValidationError("QR token missing exp");
    }

    // Reject obviously expired tokens (nonce guard is the primary control)
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > claims.exp) {
      throw new ValidationError("QR token expired");
    }

    return QrToken.create({
      passId: claims.sub,
      tenantId: claims.tid,
      nonce: claims.nce,
      iat: claims.iat,
      exp: claims.exp,
    });
  }
}

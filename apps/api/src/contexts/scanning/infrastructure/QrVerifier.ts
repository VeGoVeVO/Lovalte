import crypto from "node:crypto";
import { ValidationError } from "../../../kernel";
import { QrToken } from "../domain/QrToken";
import type { IQrVerifier } from "../application/ports";

/** Claims carried by the compact QR token minted at pass issuance. */
interface QrClaims {
  passId?: unknown;
  tenantId?: unknown;
  nonce?: unknown;
  iat?: unknown;
}

/**
 * Verifies the compact HMAC-SHA256 token the wallet pass barcode (and the web
 * issue page) carry: `base64url(payload).base64url(sig)` where payload is
 * `{ passId, tenantId, nonce, iat }` signed with QR_TOKEN_SECRET.
 *
 * A loyalty card's wallet QR is static and scanned on every visit, so it is NOT
 * single-use and does not expire — authenticity is guaranteed by the HMAC and
 * tenant isolation is enforced by the caller.
 */
export class QrVerifier implements IQrVerifier {
  constructor(private readonly secret: string) {}

  async verify(rawToken: string): Promise<QrToken> {
    const dot = rawToken.indexOf(".");
    if (dot <= 0 || dot >= rawToken.length - 1) {
      throw new ValidationError("Malformed QR token");
    }
    const body = rawToken.slice(0, dot);
    const receivedSig = rawToken.slice(dot + 1);

    const expectedSig = crypto.createHmac("sha256", this.secret).update(body).digest("base64url");
    if (
      receivedSig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(receivedSig, "utf8"), Buffer.from(expectedSig, "utf8"))
    ) {
      throw new ValidationError("Invalid QR token signature");
    }

    let claims: QrClaims;
    try {
      claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as QrClaims;
    } catch {
      throw new ValidationError("Malformed QR token payload");
    }
    if (typeof claims.passId !== "string" || claims.passId.length === 0) {
      throw new ValidationError("QR token missing passId");
    }
    if (typeof claims.tenantId !== "string" || claims.tenantId.length === 0) {
      throw new ValidationError("QR token missing tenantId");
    }

    const iat = typeof claims.iat === "number" ? claims.iat : Math.floor(Date.now() / 1000);
    return QrToken.create({
      passId: claims.passId,
      tenantId: claims.tenantId,
      nonce: typeof claims.nonce === "string" ? claims.nonce : "",
      iat,
      exp: iat + 315_360_000, // nominal 10y; the card is intentionally reusable
    });
  }
}

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compact HMAC-SHA256 tokens for the self-service enrollment flow:
 *   base64url(payloadJSON).base64url(sig)
 *
 * `typ` namespaces a token so an "enroll" token can never be replayed as a
 * "download" token. Tokens are unguessable and tamper-proof (the merchant's
 * tenant/template ids are signed), so the public enroll/download endpoints need
 * no session - the token IS the capability.
 */
export type TokenType = "enroll" | "download";

/** Download links are handed to a customer right after enrollment - 30 days
 *  covers "I'll add it to Wallet later" without leaving the link valid forever. */
export const DOWNLOAD_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface TokenClaims {
  typ: TokenType;
  [k: string]: string;
}

export function signToken(secret: string, claims: TokenClaims, nowSeconds: number): string {
  const payload = { ...claims, iat: nowSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verifies a token's signature and type. `maxAgeMs`, when given, additionally
 * rejects a token whose `iat` is older than that window - use it for download
 * tokens (short-lived, tied to a single checkout). Enroll QR tokens are printed
 * collateral (posters, table tents) and must keep working indefinitely, so their
 * call sites omit `maxAgeMs`.
 */
export function verifyToken(
  secret: string,
  token: string,
  expectedType: TokenType,
  maxAgeMs?: number,
): Record<string, string> | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<
      string,
      string
    >;
    if (claims.typ !== expectedType) return null;
    if (maxAgeMs !== undefined) {
      const iat = Number(claims.iat);
      if (!Number.isFinite(iat) || Date.now() - iat * 1000 > maxAgeMs) return null;
    }
    return claims;
  } catch {
    return null;
  }
}

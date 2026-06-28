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

export function verifyToken(
  secret: string,
  token: string,
  expectedType: TokenType,
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
    return claims;
  } catch {
    return null;
  }
}

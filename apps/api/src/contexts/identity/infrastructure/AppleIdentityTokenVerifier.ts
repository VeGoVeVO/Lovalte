import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { UnauthorizedError, ValidationError } from "../../../kernel";

type AppleJwk = {
  kid: string;
  alg: string;
  use: string;
  kty: string;
  n: string;
  e: string;
};

type AppleJwks = {
  keys: AppleJwk[];
};

type AppleClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  email_verified?: boolean | "true" | "false";
  nonce?: string;
};

export interface VerifiedAppleIdentity {
  email: string;
}

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const CACHE_MS = 60 * 60 * 1000;

export class AppleIdentityTokenVerifier {
  private cachedKeys: { keys: AppleJwk[]; expiresAt: number } | null = null;

  constructor(private readonly audiences: string[]) {}

  async verify(identityToken: string, expectedNonce?: string): Promise<VerifiedAppleIdentity> {
    const parts = identityToken.split(".");
    if (parts.length !== 3) throw new UnauthorizedError("Invalid Apple identity token");

    const header = parseJsonPart<{ alg?: string; kid?: string }>(parts[0]);
    const claims = parseJsonPart<AppleClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) {
      throw new UnauthorizedError("Invalid Apple identity token");
    }

    const key = (await this.getKeys()).find((k) => k.kid === header.kid && k.alg === "RS256");
    if (!key) throw new UnauthorizedError("Unknown Apple signing key");

    const validSignature = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key, format: "jwk" }),
      base64UrlToBuffer(parts[2]),
    );
    if (!validSignature) throw new UnauthorizedError("Invalid Apple identity token signature");

    validateClaims(claims, this.audiences, expectedNonce);
    return { email: claims.email!.toLowerCase().trim() };
  }

  private async getKeys(): Promise<AppleJwk[]> {
    const now = Date.now();
    if (this.cachedKeys && this.cachedKeys.expiresAt > now) return this.cachedKeys.keys;

    const res = await fetch(APPLE_JWKS_URL);
    if (!res.ok) throw new UnauthorizedError("Unable to verify Apple identity token");
    const jwks = (await res.json()) as AppleJwks;
    this.cachedKeys = { keys: jwks.keys, expiresAt: now + CACHE_MS };
    return jwks.keys;
  }
}

function validateClaims(claims: AppleClaims, audiences: string[], expectedNonce?: string): void {
  if (audiences.length === 0) {
    throw new ValidationError("Apple Sign In is not configured");
  }
  if (claims.iss !== APPLE_ISSUER) {
    throw new UnauthorizedError("Invalid Apple identity token issuer");
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some((value) => value && audiences.includes(value))) {
    throw new UnauthorizedError("Invalid Apple identity token audience");
  }
  if (!claims.exp || claims.exp * 1000 <= Date.now()) {
    throw new UnauthorizedError("Apple identity token expired");
  }
  if (!claims.email) {
    throw new UnauthorizedError("Apple identity token is missing an email");
  }
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw new UnauthorizedError("Apple email is not verified");
  }
  if (expectedNonce && claims.nonce && !nonceMatches(claims.nonce, expectedNonce)) {
    throw new UnauthorizedError("Invalid Apple identity token nonce");
  }
}

function nonceMatches(claimedNonce: string, expectedNonce: string): boolean {
  const hashedNonce = createHash("sha256").update(expectedNonce).digest("hex");
  return claimedNonce === expectedNonce || claimedNonce === hashedNonce;
}

function parseJsonPart<T>(part: string): T {
  try {
    return JSON.parse(base64UrlToBuffer(part).toString("utf8")) as T;
  } catch {
    throw new UnauthorizedError("Invalid Apple identity token");
  }
}

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

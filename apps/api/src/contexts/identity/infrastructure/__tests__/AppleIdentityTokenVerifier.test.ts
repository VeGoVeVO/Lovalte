import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppleIdentityTokenVerifier } from "../AppleIdentityTokenVerifier";

const AUDIENCE = "com.lovalte.app";
const KID = "apple-test-key";

describe("AppleIdentityTokenVerifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts Apple's SHA-256 nonce claim for native sign in", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
    const nonce = "nonce-from-native-app";
    const identityToken = makeToken(privateKey, {
      kid: KID,
      claims: {
        iss: "https://appleid.apple.com",
        aud: AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 60,
        email: "Owner@Acme.com",
        email_verified: true,
        nonce: createHash("sha256").update(nonce).digest("hex"),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          keys: [
            {
              ...publicJwk,
              kid: KID,
              alg: "RS256",
              use: "sig",
            },
          ],
        }),
      ),
    );

    const verifier = new AppleIdentityTokenVerifier([AUDIENCE]);

    await expect(verifier.verify(identityToken, nonce)).resolves.toEqual({ email: "owner@acme.com" });
  });
});

function makeToken(
  privateKey: Parameters<typeof sign>[2],
  input: {
    kid: string;
    claims: Record<string, unknown>;
  },
): string {
  const header = encode({ alg: "RS256", kid: input.kid, typ: "JWT" });
  const claims = encode(input.claims);
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), privateKey);
  return `${header}.${claims}.${base64Url(signature)}`;
}

function encode(value: Record<string, unknown>): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

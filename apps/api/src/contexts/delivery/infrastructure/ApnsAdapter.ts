import http2 from "node:http2";
import fs from "node:fs";
import crypto from "node:crypto";
import type { IPushNotificationPort } from "../domain/ports";

const APNS_HOST = "https://api.push.apple.com";
const JWT_TTL_MS = 50 * 60 * 1_000; // 50 minutes

interface JwtCache {
  token: string;
  expiresAt: number;
}

function log(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/**
 * APNs HTTP/2 push-notification adapter (ES256 JWT auth).
 *
 * Reads from process.env (NOT config/env.ts):
 *   APNS_KEY_PATH  - path to the .p8 private key file
 *   APNS_KEY_ID    - 10-character key ID shown in Apple Developer portal
 *   APNS_TEAM_ID   - 10-character Team ID shown in Apple Developer portal
 *
 * Falls back to a no-op log when any of those env vars is absent so that
 * non-production environments continue to work without credentials.
 *
 * JWT is cached for 50 minutes (Apple allows up to 60 min).
 * The HTTP/2 session is reused across calls for performance.
 */
export class ApnsAdapter implements IPushNotificationPort {
  private jwtCache: JwtCache | null = null;
  private session: http2.ClientHttp2Session | null = null;

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private configured(): boolean {
    return !!(
      process.env["APNS_KEY_PATH"] &&
      process.env["APNS_KEY_ID"] &&
      process.env["APNS_TEAM_ID"]
    );
  }

  private buildJwt(): string {
    const now = Date.now();
    if (this.jwtCache && this.jwtCache.expiresAt > now) {
      return this.jwtCache.token;
    }

    const keyPath = process.env["APNS_KEY_PATH"]!;
    const keyId = process.env["APNS_KEY_ID"]!;
    const teamId = process.env["APNS_TEAM_ID"]!;

    const pem = fs.readFileSync(keyPath, "utf8");
    const iat = Math.floor(now / 1_000);

    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: teamId, iat })).toString("base64url");
    const signing = `${header}.${payload}`;

    // ES256: ECDSA P-256 + SHA-256; ieee-p1363 gives raw r||s bytes (no DER wrapper)
    const sig = crypto.sign("SHA256", Buffer.from(signing), {
      key: pem,
      dsaEncoding: "ieee-p1363",
    });

    const token = `${signing}.${sig.toString("base64url")}`;
    this.jwtCache = { token, expiresAt: now + JWT_TTL_MS };
    return token;
  }

  private getSession(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }
    const sess = http2.connect(APNS_HOST);
    const clear = (): void => {
      this.session = null;
    };
    sess.once("error", clear);
    sess.once("close", clear);
    this.session = sess;
    return sess;
  }

  /**
   * Send one push to a single device token.
   * Always resolves - errors are logged but never propagated so that a bad
   * token doesn't block the remaining batch.
   */
  private sendOne(
    sess: http2.ClientHttp2Session,
    jwt: string,
    pushToken: string,
    passTypeIdentifier: string,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const req = sess.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        "apns-topic": passTypeIdentifier,
        "apns-push-type": "background",
        "apns-priority": "5",
        "apns-expiration": "0",
        authorization: `bearer ${jwt}`,
        "content-type": "application/json",
      });

      req.setEncoding("utf8");
      req.write("{}");
      req.end();

      let status: number | undefined;
      let body = "";

      req.on("response", (headers) => {
        status = headers[":status"];
      });

      req.on("data", (chunk: string) => {
        body += chunk;
      });

      req.on("end", () => {
        if (status === undefined || status < 200 || status >= 300) {
          log({ source: "ApnsAdapter", event: "apns_error", pushToken, status, body });
        }
        resolve();
      });

      req.on("error", (err: unknown) => {
        log({ source: "ApnsAdapter", event: "apns_request_error", pushToken, error: String(err) });
        resolve();
      });
    });
  }

  // -------------------------------------------------------------------------
  // IPushNotificationPort
  // -------------------------------------------------------------------------

  async notify(pushTokens: string[], passTypeIdentifier: string): Promise<void> {
    if (pushTokens.length === 0) return;

    if (!this.configured()) {
      log({
        source: "ApnsAdapter",
        event: "notify_stub",
        passTypeIdentifier,
        tokenCount: pushTokens.length,
      });
      return;
    }

    const jwt = this.buildJwt();
    const sess = this.getSession();

    await Promise.all(
      pushTokens.map((token) => this.sendOne(sess, jwt, token, passTypeIdentifier)),
    );
  }
}

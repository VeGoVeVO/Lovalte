import http2 from "node:http2";
import fs from "node:fs";
import crypto from "node:crypto";
import type { AppConfig } from "../../../config/env";
import type { IPushNotificationPort, PushResult } from "../domain/ports";

const APNS_HOST = "https://api.push.apple.com";
const JWT_TTL_MS = 50 * 60 * 1_000; // 50 minutes
const PUSH_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

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
 * Reads APNs credentials from AppConfig (constructor-injected) instead of
 * process.env directly, keeping all env access at the composition boundary.
 * Falls back to a no-op log when any credential is absent so that
 * non-production environments continue to work without them (env.ts requires
 * them in production, so this path is dev/test only).
 *
 * JWT is cached for 50 minutes (Apple allows up to 60 min).
 * The HTTP/2 session is reused across calls for performance.
 */
export class ApnsAdapter implements IPushNotificationPort {
  private jwtCache: JwtCache | null = null;
  private session: http2.ClientHttp2Session | null = null;

  constructor(private readonly config: AppConfig) {}

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private configured(): boolean {
    return !!(this.config.APNS_KEY_PATH && this.config.APNS_KEY_ID && this.config.APNS_TEAM_ID);
  }

  private buildJwt(): string {
    const now = Date.now();
    if (this.jwtCache && this.jwtCache.expiresAt > now) {
      return this.jwtCache.token;
    }

    const keyPath = this.config.APNS_KEY_PATH!;
    const keyId = this.config.APNS_KEY_ID!;
    const teamId = this.config.APNS_TEAM_ID!;

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
   * Always resolves - the caller inspects `ok`/`status`/`reason` instead of a
   * thrown error, so a bad token doesn't block the remaining batch.
   */
  private sendOne(
    sess: http2.ClientHttp2Session,
    jwt: string,
    pushToken: string,
    passTypeIdentifier: string,
  ): Promise<PushResult> {
    return new Promise<PushResult>((resolve) => {
      const expiration = String(Math.floor((Date.now() + PUSH_EXPIRATION_MS) / 1_000));
      // Wallet pass-topic pushes are their own APNs category: topic = the pass
      // type id (not an app bundle), payload = empty {} per the WalletPasses
      // web-service doc. "alert" + priority 10 is the production-proven combo
      // for pass topics; do NOT "fix" this to "background" - background pushes
      // require content-available:1 (which pass pushes can't carry) and get
      // power-throttled, which is exactly the delayed/dropped-update bug this
      // replaced. Locked by the header test in __tests__/ApnsAdapter.test.ts.
      const req = sess.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        "apns-topic": passTypeIdentifier,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": expiration,
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
        const ok = status !== undefined && status >= 200 && status < 300;
        let reason: string | undefined;
        if (!ok && body) {
          try {
            reason = (JSON.parse(body) as { reason?: string }).reason;
          } catch {
            // Non-JSON body - leave reason undefined.
          }
        }
        if (!ok) {
          log({ source: "ApnsAdapter", event: "apns_error", pushToken, status, reason, body });
        }
        resolve({ pushToken, ok, status, reason });
      });

      req.on("error", (error: unknown) => {
        log({ source: "ApnsAdapter", event: "apns_request_error", pushToken, error: String(error) });
        resolve({ pushToken, ok: false, reason: String(error) });
      });
    });
  }

  // -------------------------------------------------------------------------
  // IPushNotificationPort
  // -------------------------------------------------------------------------

  async notify(pushTokens: string[], passTypeIdentifier: string): Promise<PushResult[]> {
    if (pushTokens.length === 0) return [];

    if (!this.configured()) {
      log({
        source: "ApnsAdapter",
        event: "notify_stub",
        passTypeIdentifier,
        tokenCount: pushTokens.length,
      });
      return pushTokens.map((pushToken) => ({ pushToken, ok: true }));
    }

    const jwt = this.buildJwt();
    const sess = this.getSession();

    return Promise.all(
      pushTokens.map((token) => this.sendOne(sess, jwt, token, passTypeIdentifier)),
    );
  }
}

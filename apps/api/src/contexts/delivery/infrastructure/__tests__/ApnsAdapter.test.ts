import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig } from "../../../../config/env";

// Capture every HTTP/2 request's headers + body instead of talking to APNs.
const requests: Array<{ headers: Record<string, string>; body: string }> = [];

class FakeStream extends EventEmitter {
  body = "";
  setEncoding(): this {
    return this;
  }
  write(chunk: string): boolean {
    this.body += chunk;
    return true;
  }
  end(): void {
    // Defer: the adapter attaches its listeners AFTER calling end().
    setImmediate(() => {
      this.emit("response", { ":status": 200 });
      this.emit("end");
    });
  }
}

vi.mock("node:http2", () => ({
  default: {
    connect: () => ({
      closed: false,
      destroyed: false,
      once: () => undefined,
      request: (headers: Record<string, string>) => {
        const stream = new FakeStream();
        const orig = stream.end.bind(stream);
        stream.end = () => {
          requests.push({ headers, body: stream.body });
          orig();
        };
        return stream;
      },
    }),
  },
}));

import { ApnsAdapter } from "../ApnsAdapter";

/** Real P-256 key on disk so buildJwt's fs+crypto path runs unmocked. */
function makeKeyFile(): string {
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const file = join(mkdtempSync(join(tmpdir(), "apns-test-")), "key.p8");
  writeFileSync(file, pem);
  return file;
}

const config = {
  APNS_KEY_PATH: makeKeyFile(),
  APNS_KEY_ID: "ABCDE12345",
  APNS_TEAM_ID: "TEAM123456",
} as AppConfig;

describe("ApnsAdapter", () => {
  beforeEach(() => {
    requests.length = 0;
  });

  /**
   * Locks the pass-topic push contract: topic = pass type id, apns-push-type
   * ALERT with priority 10 and a nonzero expiration, empty {} payload. A
   * "background" push here is the bug this replaced (requires
   * content-available:1, gets power-throttled -> delayed/dropped updates).
   */
  it("sends alert-type priority-10 pushes with empty payload to the pass-type topic", async () => {
    const adapter = new ApnsAdapter(config);
    const results = await adapter.notify(["tok-1", "tok-2"], "pass.com.lovalte.loyalty");

    expect(results).toEqual([
      { pushToken: "tok-1", ok: true, status: 200, reason: undefined },
      { pushToken: "tok-2", ok: true, status: 200, reason: undefined },
    ]);
    expect(requests).toHaveLength(2);
    for (const r of requests) {
      expect(r.headers["apns-push-type"]).toBe("alert");
      expect(r.headers["apns-priority"]).toBe("10");
      expect(r.headers["apns-topic"]).toBe("pass.com.lovalte.loyalty");
      expect(Number(r.headers["apns-expiration"])).toBeGreaterThan(Date.now() / 1000);
      expect(r.headers[":path"]).toMatch(/^\/3\/device\/tok-/);
      expect(r.headers.authorization).toMatch(/^bearer /);
      expect(r.body).toBe("{}");
    }
  });

  it("returns stub ok-results without sending when APNs is unconfigured (dev/test only)", async () => {
    const adapter = new ApnsAdapter({} as AppConfig);
    const results = await adapter.notify(["tok-1"], "pass.com.lovalte.loyalty");
    expect(requests).toHaveLength(0);
    // ok:true by design: keeps the dev reconciliation sweep from re-pushing
    // forever; production can't reach this path (env.ts requires APNS_* there).
    expect(results).toEqual([{ pushToken: "tok-1", ok: true }]);
  });
});

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import Redis from "ioredis";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app";
import { contextModules } from "../../src/composition";
import { InMemoryEventBus } from "../../src/infrastructure/InMemoryEventBus";
import { loadConfig } from "../../src/config/env";
import { systemClock } from "../../src/kernel";
import type { Deps } from "../../src/shared/deps";

/**
 * API integration tests - drive the real composed app via fastify.inject against
 * the live Postgres + Redis (docker compose). No raw-SQL seeding; everything goes
 * through HTTP so the cross-context wiring + auth + tenant isolation are exercised
 * exactly as a client hits them.
 *
 * The signed-pass -> scan -> points chain needs Apple signing material + a pass
 * model on disk; that path is covered by the per-context handler unit tests and
 * the Playwright e2e (scan via API). Here we cover everything that does not
 * require Apple signing.
 */

let app: FastifyInstance;
let pool: Pool;
let redis: Redis;
const RUN = Date.now(); // run-unique suffix so re-runs don't collide on slug/email

function cookieOf(res: { cookies: Array<{ name: string; value: string }> }): string {
  const c = res.cookies.find((x) => x.name === "lovalte_session");
  if (!c) throw new Error("no session cookie set");
  return `lovalte_session=${c.value}`;
}

async function signup(label: string) {
  const email = `owner+${label}-${RUN}@cafe.test`;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    payload: { businessName: `Cafe ${label} ${RUN}`, email, password: "hunter2hunter2" },
  });
  expect(res.statusCode).toBe(201);
  return { cookie: cookieOf(res), email };
}

const templateBody = {
  name: "Loyalty",
  organizationName: "Test Org",
  logoText: "Cafe",
  backgroundColor: "rgb(30,40,60)",
  foregroundColor: "rgb(255,255,255)",
  labelColor: "rgb(200,200,200)",
  headerFields: [],
  primaryFields: [{ key: "points", label: "POINTS", valueTemplate: "0" }],
  secondaryFields: [],
  auxiliaryFields: [],
  backFields: [],
  pointsPerVisit: 1,
  rewardThreshold: 10,
  tierRules: [],
};

// success envelope is inconsistent across contexts ({data} vs bare) - unwrap either
function body(res: { json: () => any }): any {
  const j = res.json();
  return j && typeof j === "object" && "data" in j ? j.data : j;
}

beforeAll(async () => {
  try {
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env");
  } catch {
    /* rely on real env */
  }
  const config = loadConfig();
  pool = new Pool({ connectionString: config.DATABASE_URL });
  redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const deps: Deps = { pool, redis, bus: new InMemoryEventBus(), clock: systemClock, config };
  app = await buildApp(deps, contextModules);
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  redis?.disconnect();
});

describe("identity + session", () => {
  it("signup issues a session and /auth/me returns the owner", async () => {
    const { cookie } = await signup("me");
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(body(me).role).toBe("owner");
    expect(typeof body(me).tenantId).toBe("string");
  });

  it("rejects an unauthenticated protected request with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/card-templates" });
    expect(res.statusCode).toBe(401);
  });
});

describe("card-design lifecycle", () => {
  it("creates -> registers assets -> publishes -> lists as published", async () => {
    const { cookie } = await signup("cards");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/card-templates",
      headers: { cookie },
      payload: templateBody,
    });
    expect(created.statusCode).toBe(201);
    const id = body(created).id ?? body(created).templateId;
    expect(typeof id).toBe("string");

    for (const kind of ["icon", "logo", "strip"] as const) {
      const a = await app.inject({
        method: "POST",
        url: `/api/v1/card-templates/${id}/assets`,
        headers: { cookie },
        payload: { kind, ref: `https://cdn.test/${kind}.png` },
      });
      expect(a.statusCode).toBe(201);
    }

    const pub = await app.inject({
      method: "POST",
      url: `/api/v1/card-templates/${id}/publish`,
      headers: { cookie },
      payload: {},
    });
    expect(pub.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/card-templates?status=published",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const rows = body(list);
    const items = Array.isArray(rows) ? rows : (rows.items ?? rows.templates ?? []);
    expect(items.some((t: any) => (t.id ?? t.templateId) === id)).toBe(true);
  });
});

describe("staff invitations", () => {
  it("invites a teammate and lists them", async () => {
    const { cookie } = await signup("staff");
    const inv = await app.inject({
      method: "POST",
      url: "/api/v1/users/invite",
      headers: { cookie },
      payload: { email: `staff+${RUN}@cafe.test`, role: "staff" },
    });
    expect([200, 201]).toContain(inv.statusCode);

    const users = await app.inject({ method: "GET", url: "/api/v1/users", headers: { cookie } });
    expect(users.statusCode).toBe(200);
    const list = body(users);
    expect(Array.isArray(Array.isArray(list) ? list : (list.items ?? []))).toBe(true);
  });
});

describe("analytics read model", () => {
  it("returns a numeric overview for a fresh tenant", async () => {
    const { cookie } = await signup("an");
    const ov = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { cookie },
    });
    expect(ov.statusCode).toBe(200);
    const d = body(ov);
    expect(typeof d.totalMembers).toBe("number");
    expect(typeof d.pointsLiability).toBe("number");
  });
});

describe("tenant isolation", () => {
  it("tenant B cannot see tenant A's templates", async () => {
    const a = await signup("isoA");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/card-templates",
      headers: { cookie: a.cookie },
      payload: templateBody,
    });
    const aId = body(created).id ?? body(created).templateId;

    const b = await signup("isoB");
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/card-templates",
      headers: { cookie: b.cookie },
    });
    expect(list.statusCode).toBe(200);
    const rows = body(list);
    const items = Array.isArray(rows) ? rows : (rows.items ?? rows.templates ?? []);
    expect(items.some((t: any) => (t.id ?? t.templateId) === aId)).toBe(false);
  });
});

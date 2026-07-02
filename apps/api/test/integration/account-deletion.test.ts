/**
 * Account deletion — complete data erasure (Google Play / GDPR "delete account").
 *
 * Proves the TenantDeleted event-driven purge erases EVERY tenant-scoped row across
 * all six bounded contexts, exercising the real route → handler → bus → per-context
 * purgers → tenant-root drop path and migration 0090's relaxed append-only guards.
 *
 * Requires a reachable Postgres + Redis with migrations applied (run
 * `npm run migrate` first). Set DATABASE_URL + REDIS_URL (and the other env vars
 * from src/config/env.ts). Skips automatically when no DB is configured.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { systemClock } from "../../src/kernel";
import { InMemoryEventBus } from "../../src/infrastructure/InMemoryEventBus";
import { buildApp } from "../../src/http/app";
import { contextModules } from "../../src/composition";
import { loadConfig } from "../../src/config/env";
import type { Deps } from "../../src/shared/deps";

// Every tenant-scoped table that must be empty after deletion. (delivery.devices is
// shared across tenants and intentionally excluded.)
const TENANT_TABLES = [
  "iam.tenants",
  "iam.users",
  "iam.invitations",
  "loyalty.tiers",
  "loyalty.members",
  "loyalty.point_ledger",
  "card_templates",
  "template_assets",
  "pass_types",
  "passes",
  "redemption_events",
  "analytics_events",
  "card_images",
  "delivery.registrations",
  "support.tickets",
  "support.ticket_messages",
] as const;

const hasDb = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const suite = hasDb ? describe : describe.skip;

suite("account deletion erases all tenant data", () => {
  let pool: Pool;
  let redis: Redis;
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.DATABASE_URL });
    redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
    const deps: Deps = { pool, redis, bus: new InMemoryEventBus(), clock: systemClock, config, services: {} };
    app = await buildApp(deps, contextModules);
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    redis?.disconnect();
  });

  it("DELETE /api/v1/auth/account leaves zero rows in every tenant table", async () => {
    const email = `owner+${randomUUID()}@example.com`;

    // 1. Sign up → creates tenant + owner user, returns a session cookie.
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email, password: "P@ssw0rd-long!", businessName: `Acme ${randomUUID().slice(0, 8)}` },
    });
    expect(signup.statusCode).toBe(201);
    const { tenantId, userId } = signup.json().data as { tenantId: string; userId: string };
    const cookie = (signup.headers["set-cookie"] as string | string[] | undefined) ?? "";
    const sessionCookie = (Array.isArray(cookie) ? cookie.join(";") : cookie).split(";")[0];
    expect(sessionCookie).toContain("lovalte_session=");

    // 2. Seed one PII-bearing row in every other tenant table (one transaction so the
    //    transaction-local app.current_tenant satisfies RLS WITH CHECK on inserts).
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);

      await client.query(
        `INSERT INTO iam.invitations (tenant_id, email, role, token_hash, expires_at, invited_by)
         VALUES ($1, $2, 'staff', $3, now() + interval '1 day', $4)`,
        [tenantId, `invite+${randomUUID()}@example.com`, randomUUID(), userId],
      );
      await client.query(`INSERT INTO loyalty.tiers (tenant_id, name) VALUES ($1, 'Gold')`, [tenantId]);

      const passId = randomUUID();
      const member = await client.query<{ id: string }>(
        `INSERT INTO loyalty.members (tenant_id, pass_id, display_name, email)
         VALUES ($1, $2, 'Jane Doe', $3) RETURNING id`,
        [tenantId, passId, `member+${randomUUID()}@example.com`],
      );
      await client.query(
        `INSERT INTO loyalty.point_ledger (tenant_id, member_id, delta, reason)
         VALUES ($1, $2, 10, 'seed')`,
        [tenantId, member.rows[0].id],
      );

      const tpl = await client.query<{ id: string }>(
        `INSERT INTO card_templates (tenant_id, name) VALUES ($1, 'Seed Card') RETURNING id`,
        [tenantId],
      );
      await client.query(
        `INSERT INTO template_assets (tenant_id, template_id, kind, ref)
         VALUES ($1, $2, 'logo', 'seed-ref')`,
        [tenantId, tpl.rows[0].id],
      );
      await client.query(
        `INSERT INTO card_images (tenant_id, kind, content_type, byte_size, sha256, bytes)
         VALUES ($1, 'logo', 'image/png', 3, $2, '\\x010203'::bytea)`,
        [tenantId, randomUUID()],
      );

      const passType = await client.query<{ id: string }>(
        `INSERT INTO pass_types
           (tenant_id, pass_type_identifier, team_identifier, organization_name,
            description, background_color, foreground_color, web_service_url)
         VALUES ($1, 'pass.com.lovalte.loyalty', 'ABCDE12345', 'Acme', 'Loyalty',
                 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'https://lovalte.com/wallet/') RETURNING id`,
        [tenantId],
      );
      await client.query(
        `INSERT INTO passes
           (tenant_id, serial_number, pass_type_id, member_id, authentication_token)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, randomUUID(), passType.rows[0].id, member.rows[0].id, randomUUID() + randomUUID()],
      );
      await client.query(
        `INSERT INTO redemption_events (tenant_id, pass_id, action, delta, idempotency_key)
         VALUES ($1, $2, 'award', 5, $3)`,
        [tenantId, passId, randomUUID()],
      );
      await client.query(
        `INSERT INTO analytics_events (tenant_id, type, payload)
         VALUES ($1, 'pass_issued', $2)`,
        [tenantId, JSON.stringify({ memberId: member.rows[0].id })],
      );

      const device = await client.query<{ id: string }>(
        `INSERT INTO delivery.devices (device_library_identifier, push_token)
         VALUES ($1, $2) RETURNING id`,
        [randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO delivery.registrations (tenant_id, device_id, pass_id)
         VALUES ($1, $2, $3)`,
        [tenantId, device.rows[0].id, passId],
      );

      const ticket = await client.query<{ id: string }>(
        `INSERT INTO support.tickets (tenant_id, created_by, created_by_email, subject)
         VALUES ($1, $2, $3, 'Seed ticket') RETURNING id`,
        [tenantId, userId, email],
      );
      await client.query(
        `INSERT INTO support.ticket_messages (ticket_id, tenant_id, author_kind, author_email, body)
         VALUES ($1, $2, 'user', $3, 'Seed message')`,
        [ticket.rows[0].id, tenantId, email],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // Sanity: at least one tenant table is non-empty before deletion.
    const before = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM loyalty.members WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(Number(before.rows[0].c)).toBeGreaterThan(0);

    // 3. Delete the account through the real endpoint (owner session).
    const del = await app.inject({
      method: "DELETE",
      url: "/api/v1/auth/account",
      headers: { cookie: sessionCookie },
    });
    expect(del.statusCode).toBe(204);

    // 4. Every tenant-scoped table must now be empty for this tenant.
    for (const table of TENANT_TABLES) {
      const idCol = table === "iam.tenants" ? "id" : "tenant_id";
      const res = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${table} WHERE ${idCol} = $1`,
        [tenantId],
      );
      expect(`${table}=${res.rows[0].c}`).toBe(`${table}=0`);
    }
  });
});

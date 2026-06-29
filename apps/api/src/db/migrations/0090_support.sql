-- 0090_support.sql
-- Support / Helpdesk bounded context (support schema).
-- Tenant users open tickets; the single platform super-admin answers them across
-- ALL tenants. Standard tenant isolation via app_current_tenant(), PLUS an admin
-- bypass: when the API sets app.is_admin = 'true' the policy lets the row through.
-- Requires: 0000_init.sql (pgcrypto, app_current_tenant), 0010_identity.sql (iam).

CREATE SCHEMA IF NOT EXISTS support;

-- Admin bypass flag, set per-request by the API for the platform super-admin only:
--   SELECT set_config('app.is_admin', 'true', true);
-- Mirrors app_current_tenant(): reads a request-scoped GUC, defaults to false.
CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT current_setting('app.is_admin', true) = 'true' $$;

-- ─── Ticket aggregate root ────────────────────────────────────────────────────
-- created_by is a cross-context reference to iam.users (stored as the id only).
-- created_by_email is denormalised so the admin desk can show who opened it
-- without a cross-tenant join into iam.users.
CREATE TABLE IF NOT EXISTS support.tickets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL,
  created_by_email TEXT        NOT NULL,
  subject          TEXT        NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  status           TEXT        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority         TEXT        NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  -- denormalised "last activity" cache for list ordering + unread hints
  last_reply_at    TIMESTAMPTZ,
  last_reply_by    TEXT        CHECK (last_reply_by IN ('user', 'admin')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support.tickets ENABLE ROW LEVEL SECURITY;
-- Single USING policy also gates INSERT (Postgres reuses USING as WITH CHECK).
CREATE POLICY tenant_isolation ON support.tickets
  USING (tenant_id = app_current_tenant() OR app_is_admin());

CREATE INDEX IF NOT EXISTS idx_tickets_tenant
  ON support.tickets (tenant_id, created_at DESC);

-- Hot query: admin desk filters the whole table by status, newest first.
CREATE INDEX IF NOT EXISTS idx_tickets_status
  ON support.tickets (status, created_at DESC);

-- ─── Ticket messages (APPEND-ONLY thread) ─────────────────────────────────────
-- author_kind 'user' = a tenant dashboard user; 'admin' = the platform super-admin.
-- author_id is the iam.users id for user messages, NULL for admin (platform actor).
CREATE TABLE IF NOT EXISTS support.ticket_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID        NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  author_kind  TEXT        NOT NULL CHECK (author_kind IN ('user', 'admin')),
  author_id    UUID,
  author_email TEXT        NOT NULL,
  body         TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support.ticket_messages
  USING (tenant_id = app_current_tenant() OR app_is_admin());

-- Immutability: a posted message can never be edited or deleted.
CREATE RULE ticket_messages_no_update AS
  ON UPDATE TO support.ticket_messages DO INSTEAD NOTHING;
CREATE RULE ticket_messages_no_delete AS
  ON DELETE TO support.ticket_messages DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
  ON support.ticket_messages (ticket_id, created_at);

-- ─── Grants ───────────────────────────────────────────────────────────────────
-- tickets: insert (open), update (status/priority/last_reply), select (read).
-- messages: insert + select only (append-only; UPDATE/DELETE blocked by rules above).
GRANT SELECT, INSERT, UPDATE ON support.tickets         TO lovalte_app;
GRANT SELECT, INSERT         ON support.ticket_messages TO lovalte_app;

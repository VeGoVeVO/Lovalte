-- Identity & Access bounded context (iam schema)
-- Depends on: 0000_init.sql (pgcrypto, app_current_tenant())

CREATE SCHEMA IF NOT EXISTS iam;

-- ---------------------------------------------------------------------------
-- iam.tenants
-- No RLS filter on this table (it IS the tenant root; accessed by service role).
-- ---------------------------------------------------------------------------
CREATE TABLE iam.tenants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
  slug         TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]$|^[a-z0-9]$'),
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'suspended', 'cancelled')),
  plan         TEXT        NOT NULL DEFAULT 'trial',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON iam.tenants (slug);

-- ---------------------------------------------------------------------------
-- iam.users
-- Multi-tenant: one row per (tenant, person). Email unique within tenant.
-- RLS: policy filters by app_current_tenant() so cross-tenant reads are blocked
-- even if the application forgets to add a WHERE clause.
-- ---------------------------------------------------------------------------
CREATE TABLE iam.users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  password_hash TEXT        NOT NULL,   -- "saltHex:hashHex" (scrypt)
  role          TEXT        NOT NULL    CHECK (role IN ('owner', 'manager', 'staff')),
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'invited', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

ALTER TABLE iam.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON iam.users
  USING (tenant_id = app_current_tenant());

CREATE INDEX idx_users_tenant       ON iam.users (tenant_id);
CREATE INDEX idx_users_tenant_email ON iam.users (tenant_id, email);

-- ---------------------------------------------------------------------------
-- iam.invitations
-- Single-use HMAC token links (token stored as SHA-256 hash, never plaintext).
-- Scoped to tenant; expires after 48 h; consumed by marking used_at.
-- ---------------------------------------------------------------------------
CREATE TABLE iam.invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  role        TEXT        NOT NULL CHECK (role IN ('manager', 'staff')),
  token_hash  TEXT        NOT NULL UNIQUE,  -- HMAC-SHA256 hex; used for lookup
  expires_at  TIMESTAMPTZ NOT NULL,
  invited_by  UUID        NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  used_at     TIMESTAMPTZ,                 -- NULL = pending
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE iam.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON iam.invitations
  USING (tenant_id = app_current_tenant());

CREATE INDEX idx_invitations_tenant_email
  ON iam.invitations (tenant_id, email)
  WHERE used_at IS NULL;

CREATE INDEX idx_invitations_expires
  ON iam.invitations (expires_at)
  WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- Grants: lovalte_app role (created in 0000_init.sql context) needs DML on
-- all three tables. Adjust if the role is created by a later migration.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON iam.tenants     TO lovalte_app;
GRANT SELECT, INSERT, UPDATE ON iam.users        TO lovalte_app;
GRANT SELECT, INSERT, UPDATE ON iam.invitations  TO lovalte_app;

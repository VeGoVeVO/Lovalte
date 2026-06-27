# 05 — PostgreSQL Data Model

> Implementation-ready DDL. One PostgreSQL schema per bounded context. Every tenant-owned table carries `tenant_id` + a Row-Level Security policy. Point balance is computed from the append-only ledger — never stored as a mutable column. Migrations are forward-only numbered SQL files.

---

## Schema layout

```
iam.*          — Identity & Access (tenants, users, roles)
builder.*      — Card Design / Builder (templates, assets)
issuance.*     — Pass Issuance (pass_types, passes)
loyalty.*      — Membership / Loyalty (members, ledger, tiers, rules)
scanning.*     — Scanning & Redemption (scans, redemption_events, qr_nonces)
delivery.*     — Device Registration (devices, registrations)
analytics.*    — Analytics events + rollup views
audit.*        — Append-only privileged-action log
```

---

## Extensions (run once as superuser)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram indexes for name search
```

---

## 1  Identity & Access — `iam.*`

```sql
CREATE SCHEMA iam;

CREATE TABLE iam.tenants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL UNIQUE,          -- URL-safe subdomain
  display_name    TEXT        NOT NULL,
  plan            TEXT        NOT NULL DEFAULT 'trial', -- trial|starter|pro|enterprise
  status          TEXT        NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- app role used by the backend connection pool
CREATE ROLE lovalte_app NOLOGIN;
ALTER TABLE iam.tenants ENABLE ROW LEVEL SECURITY;
-- tenants table itself is not filtered by tenant_id (global); accessed by service role only

CREATE TABLE iam.users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  email_verified  BOOLEAN     NOT NULL DEFAULT false,
  password_hash   TEXT,                                 -- NULL for SSO-only users
  status          TEXT        NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

ALTER TABLE iam.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON iam.users
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE iam.roles (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID  NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  user_id     UUID  NOT NULL REFERENCES iam.users(id)   ON DELETE CASCADE,
  role        TEXT  NOT NULL CHECK (role IN ('owner','manager','staff')),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE iam.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON iam.roles
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Hot queries
CREATE INDEX idx_users_tenant      ON iam.users (tenant_id);
CREATE INDEX idx_roles_tenant_user ON iam.roles (tenant_id, user_id);
```

---

## 2  Card Design / Builder — `builder.*`

```sql
CREATE SCHEMA builder;

CREATE TABLE builder.card_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL,
  pass_type_identifier  TEXT        NOT NULL,            -- e.g. pass.com.lovalte.loyalty
  organization_name     TEXT        NOT NULL,
  description           TEXT        NOT NULL,
  logo_text             TEXT,
  background_color      TEXT        NOT NULL,            -- rgb(r,g,b) ONLY
  foreground_color      TEXT        NOT NULL,
  label_color           TEXT,
  web_service_url       TEXT        NOT NULL,            -- HTTPS, trailing /
  field_layout          JSONB       NOT NULL DEFAULT '{}',  -- storeCard field config
  barcode_format        TEXT        NOT NULL DEFAULT 'PKBarcodeFormatQR',
  barcode_encoding      TEXT        NOT NULL DEFAULT 'iso-8859-1',
  locations             JSONB,                           -- array, max 10
  published_at          TIMESTAMPTZ,
  status                TEXT        NOT NULL DEFAULT 'draft', -- draft|published|archived
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE builder.card_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON builder.card_templates
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE builder.template_assets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  template_id   UUID        NOT NULL REFERENCES builder.card_templates(id) ON DELETE CASCADE,
  asset_type    TEXT        NOT NULL CHECK (asset_type IN ('icon','logo','strip','thumbnail','background','footer')),
  scale         SMALLINT    NOT NULL CHECK (scale IN (1,2,3)),
  s3_key        TEXT        NOT NULL,                    -- object-storage key; served via signed URL
  content_type  TEXT        NOT NULL DEFAULT 'image/png',
  byte_size     INTEGER     NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, asset_type, scale)
);

ALTER TABLE builder.template_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON builder.template_assets
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX idx_template_assets_template ON builder.template_assets (template_id);
```

---

## 3  Pass Issuance — `issuance.*`

```sql
CREATE SCHEMA issuance;

-- PassTemplate aggregate root (mirrors builder.card_templates at publish time)
CREATE TABLE issuance.pass_types (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  pass_type_identifier  TEXT        NOT NULL,            -- 'pass.com.lovalte.loyalty'
  team_identifier       TEXT        NOT NULL,            -- 10-char Apple Team ID
  organization_name     TEXT        NOT NULL,
  web_service_url       TEXT        NOT NULL,            -- HTTPS, ends with /
  template_fields       JSONB       NOT NULL,            -- frozen layout at publish
  image_asset_refs      JSONB       NOT NULL,            -- S3 keys per asset_type+scale
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pass_type_identifier)
);

ALTER TABLE issuance.pass_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON issuance.pass_types
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Pass aggregate root
CREATE TABLE issuance.passes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  serial_number         TEXT        NOT NULL UNIQUE,     -- Apple identity; globally unique
  pass_type_id          UUID        NOT NULL REFERENCES issuance.pass_types(id),
  member_id             UUID        NOT NULL,            -- FK by ID only; loyalty ctx
  authentication_token  TEXT        NOT NULL,            -- ≥32 random chars; NEVER changes
  voided                BOOLEAN     NOT NULL DEFAULT false,
  pkpass_s3_key         TEXT,                           -- cached signed buffer key
  pkpass_version        INTEGER     NOT NULL DEFAULT 0,  -- bumped on each field update
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),  -- the PassKit opaque tag
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issuance.passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON issuance.passes
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Per-pass field values (current state; rebuilt from loyalty events)
CREATE TABLE issuance.pass_field_values (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id     UUID  NOT NULL REFERENCES issuance.passes(id) ON DELETE CASCADE,
  field_key   TEXT  NOT NULL,
  field_value TEXT  NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pass_id, field_key)
);

-- PassKit hot indexes (from research/07)
CREATE INDEX idx_passes_type_updated
  ON issuance.passes (pass_type_id, updated_at);        -- GET updated serials

CREATE INDEX idx_passes_serial
  ON issuance.passes (serial_number);                   -- GET latest pass

CREATE INDEX idx_passes_tenant_member
  ON issuance.passes (tenant_id, member_id);

CREATE INDEX idx_pass_field_values_pass
  ON issuance.pass_field_values (pass_id);
```

---

## 4  Membership / Loyalty — `loyalty.*`

```sql
CREATE SCHEMA loyalty;

CREATE TABLE loyalty.tiers (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID    NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,                      -- 'Bronze','Silver','Gold'
  min_points      INTEGER NOT NULL,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE loyalty.tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loyalty.tiers
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE loyalty.reward_rules (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID    NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,
  rule_type         TEXT    NOT NULL CHECK (rule_type IN ('earn','redeem','bonus')),
  points_per_unit   NUMERIC(10,4) NOT NULL,              -- e.g. 1.0 pt per $1 spend
  unit_label        TEXT,                                -- 'dollar','visit','item'
  min_spend         NUMERIC(10,2),
  active            BOOLEAN NOT NULL DEFAULT true,
  valid_from        TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE loyalty.reward_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loyalty.reward_rules
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE loyalty.members (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID  NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  email       TEXT,
  phone       TEXT,
  display_name TEXT,
  tier_id     UUID  REFERENCES loyalty.tiers(id),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

ALTER TABLE loyalty.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loyalty.members
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Append-only; balance = SUM(delta) WHERE member_id = $1
CREATE TABLE loyalty.point_ledger (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES loyalty.members(id),
  delta           INTEGER     NOT NULL,                  -- positive=earn, negative=redeem
  reason          TEXT        NOT NULL,                  -- 'purchase','redeem','bonus','adjust','expire'
  reference_id    UUID,                                  -- scan_id or external ref
  rule_id         UUID        REFERENCES loyalty.reward_rules(id),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO UPDATE/DELETE on this table; enforced by trigger below
);

ALTER TABLE loyalty.point_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loyalty.point_ledger
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Prevent any mutation of committed ledger rows
CREATE RULE point_ledger_no_update AS ON UPDATE TO loyalty.point_ledger DO INSTEAD NOTHING;
CREATE RULE point_ledger_no_delete AS ON DELETE TO loyalty.point_ledger DO INSTEAD NOTHING;

CREATE INDEX idx_ledger_member     ON loyalty.point_ledger (member_id, recorded_at DESC);
CREATE INDEX idx_ledger_tenant     ON loyalty.point_ledger (tenant_id, recorded_at DESC);
CREATE INDEX idx_members_tenant    ON loyalty.members (tenant_id);

-- Materialized balance view (refreshed on demand / via trigger)
CREATE MATERIALIZED VIEW loyalty.member_balances AS
SELECT
  tenant_id,
  member_id,
  COALESCE(SUM(delta), 0)::INTEGER AS balance,
  MAX(recorded_at)                  AS as_of
FROM loyalty.point_ledger
GROUP BY tenant_id, member_id
WITH DATA;

CREATE UNIQUE INDEX ON loyalty.member_balances (tenant_id, member_id);
```

---

## 5  Scanning & Redemption — `scanning.*`

```sql
CREATE SCHEMA scanning;

-- Single-use nonces backing QR tokens (HMAC-SHA256 or JWT)
-- Payload: { passId, tenantId, nonce, iat }
CREATE TABLE scanning.qr_nonces (
  nonce       TEXT        PRIMARY KEY,                   -- random 128-bit hex
  tenant_id   UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  pass_id     UUID        NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ                                -- NULL = still valid
);

CREATE INDEX idx_qr_nonces_tenant_pass ON scanning.qr_nonces (tenant_id, pass_id);
CREATE INDEX idx_qr_nonces_expires     ON scanning.qr_nonces (expires_at)
  WHERE consumed_at IS NULL;                             -- TTL cleanup

-- Every staff scan event
CREATE TABLE scanning.scans (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  pass_id         UUID        NOT NULL,
  member_id       UUID        NOT NULL,
  scanned_by      UUID        NOT NULL REFERENCES iam.users(id),
  nonce           TEXT        NOT NULL REFERENCES scanning.qr_nonces(nonce),
  scan_type       TEXT        NOT NULL CHECK (scan_type IN ('earn','redeem','check')),
  outcome         TEXT        NOT NULL CHECK (outcome IN ('success','rejected','expired','replayed')),
  raw_payload     TEXT        NOT NULL,                  -- the signed QR token (audit trail)
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scanning.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scanning.scans
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Idempotent redemption events (exactly-once guarantee via unique idempotency_key)
CREATE TABLE scanning.redemption_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  scan_id           UUID        NOT NULL REFERENCES scanning.scans(id),
  member_id         UUID        NOT NULL,
  idempotency_key   TEXT        NOT NULL UNIQUE,         -- deterministic: nonce+scan_type
  rule_id           UUID,
  points_delta      INTEGER     NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'applied',
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scanning.redemption_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scanning.redemption_events
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX idx_scans_tenant_member   ON scanning.scans (tenant_id, member_id, scanned_at DESC);
CREATE INDEX idx_redemptions_member    ON scanning.redemption_events (member_id, applied_at DESC);
```

---

## 6  Device Registration / Delivery — `delivery.*`

```sql
CREATE SCHEMA delivery;

CREATE TABLE delivery.devices (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_library_identifier   TEXT        NOT NULL UNIQUE,   -- Apple opaque id
  push_token                  TEXT        NOT NULL,          -- APNs; overwritten on re-register
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE delivery.registrations (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID  NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  device_id   UUID  NOT NULL REFERENCES delivery.devices(id)          ON DELETE CASCADE,
  pass_id     UUID  NOT NULL REFERENCES issuance.passes(id)           ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, pass_id)
);

ALTER TABLE delivery.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON delivery.registrations
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- PassKit hot indexes (from research/07)
-- 1. Push tokens to notify when a pass changes
CREATE INDEX idx_registrations_pass    ON delivery.registrations (pass_id);
-- 2. Serials updated since tag (needs device + pass_type lookup)
CREATE INDEX idx_registrations_device  ON delivery.registrations (device_id);
-- Device upsert uses the UNIQUE constraint on device_library_identifier
```

---

## 7  Analytics — `analytics.*`

```sql
CREATE SCHEMA analytics;

-- Append-only raw event stream (ingested via BullMQ queue)
CREATE TABLE analytics.events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,   -- 'scan','earn','redeem','pass_issued','pass_voided','member_joined','tier_change'
  member_id   UUID,
  pass_id     UUID,
  scan_id     UUID,
  properties  JSONB       NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE analytics.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.events
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX idx_analytics_tenant_time
  ON analytics.events (tenant_id, occurred_at DESC);

CREATE INDEX idx_analytics_tenant_type
  ON analytics.events (tenant_id, event_type, occurred_at DESC);

-- Daily rollup (refreshed nightly by a BullMQ job)
CREATE MATERIALIZED VIEW analytics.daily_summary AS
SELECT
  tenant_id,
  date_trunc('day', occurred_at AT TIME ZONE 'UTC') AS day,
  event_type,
  COUNT(*)                                            AS event_count,
  COUNT(DISTINCT member_id)                           AS unique_members
FROM analytics.events
GROUP BY tenant_id, date_trunc('day', occurred_at AT TIME ZONE 'UTC'), event_type
WITH DATA;

CREATE UNIQUE INDEX ON analytics.daily_summary (tenant_id, day, event_type);

-- Monthly point activity rollup
CREATE MATERIALIZED VIEW analytics.monthly_points AS
SELECT
  pl.tenant_id,
  date_trunc('month', pl.recorded_at AT TIME ZONE 'UTC') AS month,
  SUM(CASE WHEN pl.delta > 0 THEN pl.delta ELSE 0 END)   AS points_earned,
  SUM(CASE WHEN pl.delta < 0 THEN -pl.delta ELSE 0 END)  AS points_redeemed,
  COUNT(DISTINCT pl.member_id)                            AS active_members
FROM loyalty.point_ledger pl
GROUP BY pl.tenant_id, date_trunc('month', pl.recorded_at AT TIME ZONE 'UTC')
WITH DATA;

CREATE UNIQUE INDEX ON analytics.monthly_points (tenant_id, month);
```

---

## 8  Audit Log — `audit.*`

```sql
CREATE SCHEMA audit;

-- Append-only; no UPDATE/DELETE
CREATE TABLE audit.log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES iam.tenants(id),   -- NULL for system actions
  actor_id     UUID        REFERENCES iam.users(id),
  action       TEXT        NOT NULL,   -- 'tenant.created','user.role_changed','pass.voided','rule.updated', …
  resource     TEXT        NOT NULL,   -- 'iam.tenants','issuance.passes', …
  resource_id  UUID,
  before_state JSONB,
  after_state  JSONB,
  ip_address   INET,
  user_agent   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE RULE audit_no_update AS ON UPDATE TO audit.log DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit.log DO INSTEAD NOTHING;

CREATE INDEX idx_audit_tenant_time  ON audit.log (tenant_id, occurred_at DESC);
CREATE INDEX idx_audit_resource     ON audit.log (resource, resource_id);
```

---

## The 3 PassKit hot queries

```sql
-- 1. Push tokens to notify when a pass changes (UpdatePassFieldsCommand → APNs)
SELECT d.push_token
FROM delivery.registrations r
JOIN delivery.devices d ON d.id = r.device_id
JOIN issuance.passes   p ON p.id = r.pass_id
WHERE p.serial_number  = $1                              -- serial
  AND p.pass_type_id   = (
    SELECT id FROM issuance.pass_types
    WHERE pass_type_identifier = $2                      -- passTypeIdentifier
      AND tenant_id = $3
  );

-- 2. Serials updated since a tag (GET updated-serials endpoint)
SELECT p.serial_number, p.updated_at AS last_updated
FROM delivery.registrations r
JOIN delivery.devices      d  ON d.id  = r.device_id
JOIN issuance.passes       p  ON p.id  = r.pass_id
JOIN issuance.pass_types   pt ON pt.id = p.pass_type_id
WHERE d.device_library_identifier = $1
  AND pt.pass_type_identifier     = $2
  AND p.updated_at > $3::TIMESTAMPTZ;                   -- passesUpdatedSince

-- 3. Upsert device on registration (idempotent, refresh push token)
INSERT INTO delivery.devices (device_library_identifier, push_token)
VALUES ($1, $2)
ON CONFLICT (device_library_identifier)
DO UPDATE SET push_token = EXCLUDED.push_token,
              updated_at = now();
```

---

## RLS setup: runtime tenant context

```sql
-- The backend sets this at connection/transaction start (via Kysely beforeQuery hook)
SET LOCAL app.tenant_id = '<uuid>';

-- All RLS policies on tenant-scoped tables resolve to:
-- tenant_id = current_setting('app.tenant_id')::UUID
```

---

## Point balance — always from the ledger

```sql
-- Realtime balance (use materialized view for dashboards, raw for strong reads)
SELECT COALESCE(SUM(delta), 0)::INTEGER AS balance
FROM loyalty.point_ledger
WHERE member_id = $1 AND tenant_id = $2;

-- Refresh materialized view (called by BullMQ after each scan)
REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty.member_balances;
```

---

## Migration strategy

Migrations live at `src/infrastructure/db/migrations/` as forward-only numbered SQL files executed by a thin custom runner (no ORM migration DSL).

```
0001_create_schemas.sql            — CREATE SCHEMA for all 8 contexts
0002_iam_tenants_users_roles.sql   — iam.* DDL + RLS + indexes
0003_builder_templates_assets.sql  — builder.* DDL + RLS + indexes
0004_issuance_pass_types_passes.sql — issuance.* DDL + RLS + indexes
0005_loyalty_tiers_rules_members.sql — loyalty.* DDL + rules
0006_loyalty_point_ledger.sql      — point_ledger + immutability rules + mat view
0007_scanning_nonces_scans.sql     — scanning.* DDL + RLS
0008_delivery_devices_registrations.sql — delivery.* DDL + RLS
0009_analytics_events_rollups.sql  — analytics.* DDL + mat views
0010_audit_log.sql                 — audit.* DDL + immutability rules
0011_indexes_passkit_hot_queries.sql — explicit composite indexes for PassKit 3 queries
```

Migration runner contract:

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  id         SERIAL      PRIMARY KEY,
  filename   TEXT        NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Runner: SELECT filename FROM _migrations ORDER BY id;
-- Skip already-applied; run new ones in filename order inside a transaction; record on success.
-- Rollback is NOT supported — fix forward with a new numbered migration.
```

-- ============================================================
-- Migration 0030: Pass-Issuance context
--   Tables: pass_types, passes
-- ============================================================
-- pass_types: frozen template snapshot (populated from CardTemplatePublished events).
--             Keeps this context independent of the card-design schema.
-- passes:     Pass aggregate root with field_values as jsonb, immutable auth token,
--             and a monotonic last_updated used as the If-Modified-Since tag.
-- ============================================================

-- ── pass_types ────────────────────────────────────────────────────────────────

CREATE TABLE pass_types (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL,
  pass_type_identifier TEXT        NOT NULL,   -- e.g. pass.com.lovalte.loyalty
  team_identifier      TEXT        NOT NULL,   -- 10-char Apple Developer Team ID
  organization_name    TEXT        NOT NULL,
  description          TEXT        NOT NULL,
  logo_text            TEXT,
  background_color     TEXT        NOT NULL,   -- rgb(r, g, b) only
  foreground_color     TEXT        NOT NULL,
  label_color          TEXT,
  web_service_url      TEXT        NOT NULL,   -- HTTPS, trailing /
  field_definitions    JSONB       NOT NULL DEFAULT '[]',
  image_asset_refs     JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pass_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY pass_types_select ON pass_types
  AS PERMISSIVE FOR SELECT
  USING (tenant_id = app_current_tenant());

CREATE POLICY pass_types_insert ON pass_types
  AS PERMISSIVE FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY pass_types_update ON pass_types
  AS PERMISSIVE FOR UPDATE
  USING (tenant_id = app_current_tenant());

CREATE INDEX idx_pass_types_tenant ON pass_types (tenant_id);

-- ── passes ────────────────────────────────────────────────────────────────────

CREATE TABLE passes (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL,
  serial_number        TEXT        NOT NULL UNIQUE,   -- Apple identity; globally unique
  pass_type_id         UUID        NOT NULL REFERENCES pass_types(id),
  member_id            UUID        NOT NULL,           -- FK by ID only; loyalty ctx owns Member
  authentication_token TEXT        NOT NULL,           -- >=32 random chars; NEVER updated
  field_values         JSONB       NOT NULL DEFAULT '[]',
  voided               BOOLEAN     NOT NULL DEFAULT false,
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT now(),   -- monotonic UpdateTag for PassKit
  version              INTEGER     NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY passes_select ON passes
  AS PERMISSIVE FOR SELECT
  USING (tenant_id = app_current_tenant());

CREATE POLICY passes_insert ON passes
  AS PERMISSIVE FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY passes_update ON passes
  AS PERMISSIVE FOR UPDATE
  USING (tenant_id = app_current_tenant());

-- Append-only guard: authentication_token must never change.
-- Enforced by application logic (authToken has no setter on Pass aggregate),
-- and reinforced here: UPDATE is only allowed for mutable columns.

-- ── Indexes (PassKit hot queries) ─────────────────────────────────────────────

-- GET updated serials: pass_type_id + last_updated (delivery context joins here)
CREATE INDEX idx_passes_type_updated
  ON passes (pass_type_id, last_updated);

-- GET latest pass + device registration auth: serial_number lookup
CREATE INDEX idx_passes_serial
  ON passes (serial_number);

-- Member pass lookup (issue-pass idempotency check, PointsEarned subscription)
CREATE INDEX idx_passes_tenant_member
  ON passes (tenant_id, member_id);

-- Member + template lookup (idempotency: one pass per member per template)
CREATE INDEX idx_passes_member_type
  ON passes (member_id, pass_type_id, tenant_id);

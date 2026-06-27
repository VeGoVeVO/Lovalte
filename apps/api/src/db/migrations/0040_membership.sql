-- 0040_membership.sql
-- Membership / Loyalty bounded context: tiers, members, point_ledger.
-- Requires: 0000_init.sql (app_current_tenant), iam schema (tenants table).
-- Balance is always derived via SELECT SUM(delta) - never stored as a column.

CREATE SCHEMA IF NOT EXISTS loyalty;

-- ─── Tier thresholds ─────────────────────────────────────────────────────────
-- Each tenant defines their own tiers (bronze/silver/gold/…) with point minimums.
CREATE TABLE IF NOT EXISTS loyalty.tiers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  min_points  INTEGER     NOT NULL DEFAULT 0,
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE loyalty.tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loyalty.tiers
  USING (tenant_id = app_current_tenant());

CREATE INDEX IF NOT EXISTS idx_tiers_tenant
  ON loyalty.tiers (tenant_id);

-- ─── Member aggregate root ────────────────────────────────────────────────────
-- pass_id is a cross-context reference (Pass Issuance) stored as a UUID ID only.
-- email and display_name are PII - nullable for anonymous enrolment (GDPR minimisation).
-- current_tier is a denormalised cache; source of truth is tier thresholds + ledger sum.
CREATE TABLE IF NOT EXISTS loyalty.members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  pass_id      UUID        NOT NULL,
  display_name TEXT,
  email        TEXT,
  current_tier TEXT        NOT NULL DEFAULT 'bronze',
  status       TEXT        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'suspended', 'deleted')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One pass → one member per tenant.
  UNIQUE (tenant_id, pass_id)
);

ALTER TABLE loyalty.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loyalty.members
  USING (tenant_id = app_current_tenant());

CREATE INDEX IF NOT EXISTS idx_members_tenant
  ON loyalty.members (tenant_id);

CREATE INDEX IF NOT EXISTS idx_members_pass
  ON loyalty.members (pass_id, tenant_id);

-- ─── Point ledger (APPEND-ONLY) ───────────────────────────────────────────────
-- delta > 0 = earn; delta < 0 = redeem.
-- reference_id links to an external event (e.g. scanning.scans.id).
-- The DB rules below prevent UPDATE and DELETE on committed rows.
CREATE TABLE IF NOT EXISTS loyalty.point_ledger (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  member_id    UUID        NOT NULL REFERENCES loyalty.members(id),
  delta        INTEGER     NOT NULL,
  reason       TEXT        NOT NULL,
  reference_id UUID,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE loyalty.point_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loyalty.point_ledger
  USING (tenant_id = app_current_tenant());

-- Immutability: committed ledger rows cannot be mutated or removed.
CREATE RULE point_ledger_no_update AS
  ON UPDATE TO loyalty.point_ledger DO INSTEAD NOTHING;
CREATE RULE point_ledger_no_delete AS
  ON DELETE TO loyalty.point_ledger DO INSTEAD NOTHING;

-- Hot query: balance per member (SELECT SUM(delta) WHERE member_id = $1).
CREATE INDEX IF NOT EXISTS idx_ledger_member
  ON loyalty.point_ledger (member_id, recorded_at DESC);

-- Hot query: analytics - all ledger rows for a tenant in time order.
CREATE INDEX IF NOT EXISTS idx_ledger_tenant
  ON loyalty.point_ledger (tenant_id, recorded_at DESC);

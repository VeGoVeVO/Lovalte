-- Scanning & Redemption context — append-only QR scan audit log.
-- Depends on: 0000_init.sql (app_current_tenant function, gen_random_uuid).
-- Ordering: runs after 0040_membership.sql.

-- ─── redemption_events ────────────────────────────────────────────────────────
-- Each row is one completed scan outcome (award or redeem).
-- Append-only: no UPDATE or DELETE permitted (RLS + application layer).

CREATE TABLE IF NOT EXISTS redemption_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL,
  pass_id          UUID        NOT NULL,
  action           TEXT        NOT NULL CHECK (action IN ('award', 'redeem')),
  -- Positive delta = points awarded; negative delta = points redeemed.
  delta            INTEGER     NOT NULL,
  -- Idempotency key from the staff app (Idempotency-Key HTTP header).
  -- UNIQUE enforces exactly-once persistence as belt-and-suspenders behind
  -- the 30-second Redis NX guard in RedeemScanHandler.
  idempotency_key  TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_redemption_idempotency_key UNIQUE (idempotency_key)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Audit trail: all scans for a given pass ordered by time
CREATE INDEX IF NOT EXISTS idx_redemption_events_pass
  ON redemption_events (pass_id, created_at DESC);

-- Tenant audit log: all scans within a tenant ordered by time
CREATE INDEX IF NOT EXISTS idx_redemption_events_tenant
  ON redemption_events (tenant_id, created_at DESC);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Second line of defence behind application-layer tenant scoping.
-- app_current_tenant() reads the 'app.current_tenant' session config var
-- set by the repository before each query.

ALTER TABLE redemption_events ENABLE ROW LEVEL SECURITY;

-- Single permissive policy covers SELECT, INSERT, UPDATE, DELETE.
-- Only INSERT is exercised at runtime; UPDATE/DELETE are blocked at the
-- application layer (append-only design).
CREATE POLICY redemption_events_tenant_isolation ON redemption_events
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING      (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

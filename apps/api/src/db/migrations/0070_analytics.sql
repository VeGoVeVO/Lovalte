-- ============================================================
-- Migration 0070: Analytics context - analytics_events table
-- ============================================================
-- Append-only fact table. No UPDATE or DELETE are ever issued by
-- the application; RLS restrictive policies enforce this at the DB level.
-- All aggregation is on-the-fly GROUP BY (no materialized views at M-tier).
-- ============================================================

CREATE TABLE analytics_events (
  id          BIGSERIAL    NOT NULL,
  tenant_id   UUID         NOT NULL,
  type        TEXT         NOT NULL,
  occurred_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  payload     JSONB        NOT NULL DEFAULT '{}',
  CONSTRAINT  analytics_events_pkey PRIMARY KEY (id)
);

-- ── Row-level security ──────────────────────────────────────────────────────
-- app_current_tenant() reads from set_config('app.current_tenant', $tid, true)
-- which is set at the start of every transaction by AnalyticsRepository.

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow SELECT only for rows belonging to the current tenant.
CREATE POLICY analytics_events_select ON analytics_events
  AS PERMISSIVE
  FOR SELECT
  USING (tenant_id = app_current_tenant());

-- Allow INSERT only when the row's tenant_id matches the current tenant.
CREATE POLICY analytics_events_insert ON analytics_events
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());

-- Append-only invariant: block UPDATE at DB level.
CREATE POLICY analytics_events_no_update ON analytics_events
  AS RESTRICTIVE
  FOR UPDATE
  USING (false);

-- Append-only invariant: block DELETE at DB level.
CREATE POLICY analytics_events_no_delete ON analytics_events
  AS RESTRICTIVE
  FOR DELETE
  USING (false);

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- Primary lookup: tenant + type + time (used by timeseries queries and overview counts).
CREATE INDEX idx_analytics_events_tenant_type_occurred
  ON analytics_events (tenant_id, type, occurred_at DESC);

-- Secondary lookup: tenant + time (used by overview aggregate across all types).
CREATE INDEX idx_analytics_events_tenant_occurred
  ON analytics_events (tenant_id, occurred_at DESC);

-- JSONB index for memberId extraction used in totalMembers COUNT DISTINCT.
CREATE INDEX idx_analytics_events_member_id
  ON analytics_events USING gin (payload jsonb_path_ops);

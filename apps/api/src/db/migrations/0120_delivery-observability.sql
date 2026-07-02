-- Delivery context observability: push attempt log, last-fetch tracking, raw
-- Apple Wallet diagnostic log persistence.
-- Depends on: 0060_delivery.sql (delivery.devices, delivery.registrations),
-- 0030_pass-issuance.sql (passes).

-- One row per APNs push attempt (one per device token per notify() call).
-- Not tenant-scoped by RLS: read only via delivery-status query, which already
-- filters by tenant through the passes join.
CREATE TABLE push_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id        UUID        NOT NULL,  -- pass-issuance passes(id), referenced by ID only
  serial_number  TEXT        NOT NULL,
  push_token     TEXT        NOT NULL,
  ok             BOOLEAN     NOT NULL,
  apns_status    INTEGER,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot query: reconciliation sweep + delivery-status "pushFailures24h"/"lastPushAt" (per pass).
CREATE INDEX idx_push_log_pass_created ON push_log (pass_id, created_at DESC);

-- Tracks the last time a device successfully fetched the pass binary (9.3, 200
-- response). Compared against passes.last_updated to decide up-to-date/stale.
ALTER TABLE delivery.registrations ADD COLUMN last_fetched_at TIMESTAMPTZ;

-- Raw Apple Wallet diagnostic log payloads (endpoint 9.5). stdout keeps the
-- structured per-line log; this table keeps the whole batch for later review.
CREATE TABLE wallet_device_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  logs        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

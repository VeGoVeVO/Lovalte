-- Delivery context: Apple PassKit device registration & push notification delivery.
-- Depends on: 0000_init.sql (app_current_tenant), iam schema, issuance schema.

CREATE SCHEMA IF NOT EXISTS delivery;

-- One row per physical Apple device (device_library_identifier is Apple-assigned, opaque).
-- push_token is overwritten on every re-registration - no versioning.
CREATE TABLE delivery.devices (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_library_identifier   TEXT        NOT NULL UNIQUE,
  push_token                  TEXT        NOT NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Associates a device with a pass (issued by pass-issuance context).
-- tenant_id is carried here so RLS can filter without joining issuance.passes.
-- Append-only in practice: rows are deleted only when the device removes the pass.
CREATE TABLE delivery.registrations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  device_id   UUID        NOT NULL REFERENCES delivery.devices(id)        ON DELETE CASCADE,
  pass_id     UUID        NOT NULL,  -- pass-issuance passes(id), referenced by ID only (no cross-context FK)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, pass_id)
);

ALTER TABLE delivery.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON delivery.registrations
  USING (tenant_id = app_current_tenant());

-- devices table is not tenant-scoped (devices can have passes from multiple tenants).
-- Access is controlled by application-layer parameterised queries only.

-- Hot indexes for the 3 PassKit queries (see 05-postgres-data-model.md):
-- 1. Push tokens to notify when a pass changes.
CREATE INDEX idx_registrations_pass   ON delivery.registrations (pass_id);
-- 2. Updated serials for a device.
CREATE INDEX idx_registrations_device ON delivery.registrations (device_id);
-- 3. Device upsert uses the UNIQUE constraint on device_library_identifier already.

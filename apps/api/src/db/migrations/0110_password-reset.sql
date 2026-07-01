-- Password reset requests for the Identity context.
-- Tokens are HMAC-SHA256 hashes; raw reset tokens are never persisted.

CREATE TABLE iam.password_resets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE iam.password_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON iam.password_resets
  USING (tenant_id = app_current_tenant());

CREATE INDEX idx_password_resets_token
  ON iam.password_resets (token_hash)
  WHERE used_at IS NULL;

CREATE INDEX idx_password_resets_user_pending
  ON iam.password_resets (user_id, expires_at)
  WHERE used_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON iam.password_resets TO lovalte_app;

-- Base extensions + shared conventions. Each bounded context owns its own
-- numbered migration (identity=0010, card-design=0020, pass-issuance=0030,
-- membership=0040, scanning=0050, delivery=0060, analytics=0070).
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- App role that context migrations GRANT to (and that prod connects as, with
-- RLS forced). Created here so a fresh container's migrations apply cleanly.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lovalte_app') THEN
    CREATE ROLE lovalte_app;
  END IF;
END $$;

-- App role used by the API connection; RLS policies key off app.current_tenant().
-- Set per request: SELECT set_config('app.current_tenant', $1, true);
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid $$;

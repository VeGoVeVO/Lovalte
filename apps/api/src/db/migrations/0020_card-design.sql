-- Card Design context: CardTemplate aggregate + template assets
-- Migration: 0020_card-design.sql
-- Dependencies: 0000_init.sql must define app_current_tenant() function used by RLS policies.

-- ============================================================
-- card_templates: the CardTemplate aggregate root
-- ============================================================
CREATE TABLE IF NOT EXISTS card_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  name        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published')),
  version     INTEGER     NOT NULL DEFAULT 0,
  -- config stores BrandConfig (colors, field layout, asset refs) and RewardRule as JSONB.
  -- All RGB colors in config MUST use rgb(r, g, b) format; hex is rejected by domain logic.
  config      JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE card_templates ENABLE ROW LEVEL SECURITY;

-- Tenants may only read/write their own templates.
CREATE POLICY card_templates_tenant_isolation ON card_templates
  USING (tenant_id = app_current_tenant());

-- Hot query: list templates by tenant + optional status filter (used in ListCardTemplates).
CREATE INDEX IF NOT EXISTS card_templates_tenant_status
  ON card_templates (tenant_id, status);

-- ============================================================
-- template_assets: uploaded asset refs (icon, logo, strip)
-- Each row is an immutable audit record of a RegisterAssetRef call.
-- The CardTemplate's config JSONB always holds the LATEST ref per kind.
-- ============================================================
CREATE TABLE IF NOT EXISTS template_assets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  template_id UUID        NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL CHECK (kind IN ('icon', 'logo', 'strip')),
  -- ref is an S3 key or full URL accepted from the client after the client performs the upload.
  ref         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE template_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_assets_tenant_isolation ON template_assets
  USING (tenant_id = app_current_tenant());

-- Lookup assets by template (used in findAssetsByTemplate).
CREATE INDEX IF NOT EXISTS template_assets_by_template
  ON template_assets (template_id, kind, created_at DESC);

-- Lookup assets by tenant (admin queries).
CREATE INDEX IF NOT EXISTS template_assets_by_tenant
  ON template_assets (tenant_id, created_at DESC);

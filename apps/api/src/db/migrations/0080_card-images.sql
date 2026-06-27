-- ============================================================
-- Migration 0080: Card-Design image store
--   Table: card_images - binary card art (icon/logo/strip) held IN the database
--   instead of an external S3/CDN URL. Lets merchants upload images or pick a
--   premade Lucide icon (rasterised to PNG client-side) without any object store.
--
--   The CardTemplate's BrandConfig still references images by ref string; that
--   ref now points at our own `GET /api/v1/images/:id` endpoint, served from
--   these bytes. Keeping bytes here (not in card_templates.config) keeps the
--   aggregate row small and lets images be cached/served independently.
-- ============================================================

CREATE TABLE IF NOT EXISTS card_images (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  kind         TEXT        NOT NULL CHECK (kind IN ('icon', 'logo', 'strip', 'generic')),
  content_type TEXT        NOT NULL,                 -- sniffed MIME, not the client's claim
  byte_size    INTEGER     NOT NULL CHECK (byte_size > 0),
  sha256       TEXT        NOT NULL,                 -- content hash (dedupe / integrity)
  source       TEXT        NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'lucide')),
  bytes        BYTEA       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE card_images ENABLE ROW LEVEL SECURITY;

-- Writes are tenant-scoped (app sets app.current_tenant per request).
CREATE POLICY card_images_tenant_isolation ON card_images
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Public read for serving: image bytes are non-sensitive card art fetched by an
-- unguessable UUID by the merchant's customers' devices (and Apple Wallet) with
-- no session. A dedicated PERMISSIVE SELECT policy keeps reads working once the
-- app stops connecting as table owner (M7 hardening) without leaking listing.
CREATE POLICY card_images_public_read ON card_images
  AS PERMISSIVE FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS card_images_by_tenant
  ON card_images (tenant_id, created_at DESC);

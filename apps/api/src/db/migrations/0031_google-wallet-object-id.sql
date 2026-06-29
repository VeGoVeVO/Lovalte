-- ============================================================
-- Migration 0031: Google Wallet integration
--   Add google_wallet_object_id to passes.
--   NULL = pass has never been saved to Google Wallet.
--   Set lazily on first "Add to Google Wallet" tap.
-- ============================================================

ALTER TABLE passes ADD COLUMN google_wallet_object_id TEXT;

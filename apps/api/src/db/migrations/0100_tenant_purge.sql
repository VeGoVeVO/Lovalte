-- 0090_tenant_purge.sql
-- Account deletion (GDPR / Google Play "delete account") must ERASE every tenant
-- row, including the two append-only tables. Normal operation stays append-only;
-- deletion is permitted ONLY inside a transaction that sets `app.purge = 'on'`
-- (set_config(..., true) → local to the transaction). The per-context TenantDeleted
-- subscribers set this flag before deleting their tenant-scoped rows.
--
-- Depends on: 0040_membership.sql (point_ledger + no_delete rule),
--             0070_analytics.sql (analytics_events + no_delete policy),
--             0000_init.sql (app_current_tenant()).

-- ── point_ledger: blanket no-delete RULE → flag-guarded TRIGGER ───────────────
-- The DO-INSTEAD-NOTHING rule blocks every delete (even the table owner) and would
-- silently break the tenant purge. Replace it with a trigger that blocks deletes
-- UNLESS app.purge is on, preserving append-only for all normal paths.
DROP RULE IF EXISTS point_ledger_no_delete ON loyalty.point_ledger;

CREATE OR REPLACE FUNCTION loyalty.guard_point_ledger_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'point_ledger is append-only (delete allowed only during account purge)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS point_ledger_block_delete ON loyalty.point_ledger;
CREATE TRIGGER point_ledger_block_delete
  BEFORE DELETE ON loyalty.point_ledger
  FOR EACH ROW EXECUTE FUNCTION loyalty.guard_point_ledger_delete();

-- ── analytics_events: RESTRICTIVE no-delete policy → flag-guarded permissive ──
-- Was RESTRICTIVE FOR DELETE USING (false) with no permissive DELETE policy, so
-- deletes were impossible. Replace with a single permissive, tenant-scoped,
-- flag-guarded DELETE policy: deletable only while purging this tenant.
DROP POLICY IF EXISTS analytics_events_no_delete ON analytics_events;

CREATE POLICY analytics_events_purge_delete ON analytics_events
  AS PERMISSIVE
  FOR DELETE
  USING (tenant_id = app_current_tenant() AND current_setting('app.purge', true) = 'on');

-- ── passes / pass_types: add the missing tenant-scoped DELETE policy ──────────
-- These tables only had SELECT/INSERT/UPDATE policies, so under RLS (a non-owner
-- connection after M7 hardening) the account purge could not erase them. They are
-- NOT append-only, so tenant scoping alone is the right guard (no purge flag).
DROP POLICY IF EXISTS passes_delete ON passes;
CREATE POLICY passes_delete ON passes
  AS PERMISSIVE FOR DELETE
  USING (tenant_id = app_current_tenant());

DROP POLICY IF EXISTS pass_types_delete ON pass_types;
CREATE POLICY pass_types_delete ON pass_types
  AS PERMISSIVE FOR DELETE
  USING (tenant_id = app_current_tenant());

-- ── support.ticket_messages: append-only no-delete RULE → flag-guarded TRIGGER ──
-- Added by 0090_support.sql after the membership ledger. Both support tables
-- FK-cascade from iam.tenants, but this one's blanket delete rule blocks the tenant
-- purge cascade. Replace it with a trigger that blocks deletes unless app.purge is on.
-- (support.tickets has no delete guard, so it cascades with nothing to change.)
DROP RULE IF EXISTS ticket_messages_no_delete ON support.ticket_messages;

CREATE OR REPLACE FUNCTION support.guard_ticket_messages_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'support.ticket_messages is append-only (delete allowed only during account purge)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_messages_block_delete ON support.ticket_messages;
CREATE TRIGGER ticket_messages_block_delete
  BEFORE DELETE ON support.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION support.guard_ticket_messages_delete();

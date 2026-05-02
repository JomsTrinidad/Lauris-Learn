-- ============================================================
-- Migration 057 – document_access_events.actor_user_id FK fix
--
-- Why this exists
--   Phase A (054) declared the FK as
--     actor_user_id REFERENCES profiles(id) ON DELETE SET NULL
--   That assumes every actor has a profiles row, but external_contacts
--   intentionally do not (they authenticate via Supabase magic-link,
--   creating an auth.users row, but never a profiles row). When the
--   log_document_access RPC tries to record an event for an external
--   actor, the FK against profiles fails and the audit row is never
--   written.
--
-- Fix
--   Re-point the FK at auth.users(id) — the broader table that every
--   real authenticated actor (staff, parent, super_admin, AND
--   external_contact) is guaranteed to be in. ON DELETE SET NULL is
--   preserved.
--
-- Safety
--   - Idempotent: DROP CONSTRAINT IF EXISTS guards re-runs.
--   - No data change: every existing profiles.id is by definition an
--     auth.users.id, so any pre-existing actor_user_id values still
--     satisfy the new FK.
--   - The existing RPC, helpers, RLS policies, and triggers are not
--     touched. 054, 055, 056 are not modified.
-- ============================================================

ALTER TABLE document_access_events
  DROP CONSTRAINT IF EXISTS document_access_events_actor_user_id_fkey;

ALTER TABLE document_access_events
  ADD CONSTRAINT document_access_events_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

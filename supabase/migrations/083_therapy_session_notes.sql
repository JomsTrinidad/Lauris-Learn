-- ============================================================
-- Migration 083 — Phase 6E.1: structured therapy session notes.
--
-- Strict isolation constraints (Phase 6E.1 approval):
--   - All school-side tables / policies / helpers / RPCs       → NOT modified.
--   - therapy_sessions table / policies / triggers              → NOT modified.
--   - accessible_document_ids / log_document_access*            → NOT modified.
--   - list_documents_for_organization / log_clinic_document_access → NOT modified.
--   - caller_owned_child_profile_ids / caller_visible_*         → NOT modified.
--   - list_clinic_members RPC                                   → NOT modified.
--
-- What this migration adds (all NEW, all isolated):
--   1. Table `therapy_session_notes` — 1:1 with therapy_sessions
--      (UNIQUE FK). Six structured TEXT fields plus authorship.
--   2. Triggers — set_updated_at, audit_log_trigger, immutable
--      column-guard on therapy_session_id + authored_by_profile_id.
--   3. RLS — SELECT piggybacks on the parent therapy_sessions row
--      visibility (no new helper). INSERT/UPDATE require active
--      clinic_admin or therapist of the session's clinic AND the
--      parent session must NOT be in status='cancelled' (hard block
--      per approval). DELETE has no policy. super_admin FOR ALL
--      bypass (incl. cancelled-session note edits, for support).
--
-- School / parent isolation: schools and parents have no policy
-- arms here. The parent therapy_sessions SELECT policy is itself
-- locked to active clinic members + (clinic_client | therapy_client)
-- memberships, so the EXISTS-on-parent check collapses to FALSE
-- for any non-clinic JWT.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS therapy_session_notes (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 1:1 with therapy_sessions. ON DELETE CASCADE only fires under
  -- super_admin / db-direct since therapy_sessions has no DELETE
  -- policy. UNIQUE enforces single-note-per-session.
  therapy_session_id          UUID         NOT NULL UNIQUE
                              REFERENCES therapy_sessions(id) ON DELETE CASCADE,

  -- Authorship. Pinned to auth.uid() at INSERT. Locked post-insert.
  authored_by_profile_id      UUID         NOT NULL
                              REFERENCES profiles(id) ON DELETE SET NULL,

  -- Six structured fields. All nullable — partial notes are valid.
  session_objective           TEXT,
  activities                  TEXT,
  child_response              TEXT,
  progress_observed           TEXT,
  home_practice               TEXT,
  private_internal_note       TEXT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS therapy_session_notes_session_idx
  ON therapy_session_notes (therapy_session_id);
CREATE INDEX IF NOT EXISTS therapy_session_notes_author_idx
  ON therapy_session_notes (authored_by_profile_id);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- 2.A — Immutability column-guard.
-- therapy_session_id and authored_by_profile_id are immutable
-- post-insert. is_super_admin() bypasses for support.
CREATE OR REPLACE FUNCTION tsn_immutable_columns_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.therapy_session_id IS DISTINCT FROM OLD.therapy_session_id THEN
    RAISE EXCEPTION
      'tsn_immutable_columns_guard: therapy_session_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.authored_by_profile_id IS DISTINCT FROM OLD.authored_by_profile_id THEN
    RAISE EXCEPTION
      'tsn_immutable_columns_guard: authored_by_profile_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tsn_immutable_columns_guard_trg ON therapy_session_notes;
CREATE TRIGGER tsn_immutable_columns_guard_trg
  BEFORE UPDATE ON therapy_session_notes
  FOR EACH ROW
  EXECUTE FUNCTION tsn_immutable_columns_guard();


-- 2.B — updated_at + audit
DROP TRIGGER IF EXISTS therapy_session_notes_set_updated_at ON therapy_session_notes;
CREATE TRIGGER therapy_session_notes_set_updated_at
  BEFORE UPDATE ON therapy_session_notes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS therapy_session_notes_audit ON therapy_session_notes;
CREATE TRIGGER therapy_session_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON therapy_session_notes
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 3. RLS
-- ════════════════════════════════════════════════════════════════

ALTER TABLE therapy_session_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_therapy_session_notes"             ON therapy_session_notes;
DROP POLICY IF EXISTS "clinic_staff_insert_therapy_session_notes" ON therapy_session_notes;
DROP POLICY IF EXISTS "clinic_staff_update_therapy_session_notes" ON therapy_session_notes;
DROP POLICY IF EXISTS "super_admin_all_therapy_session_notes"    ON therapy_session_notes;


-- 3.A — SELECT: parent session must be visible to the caller.
-- The therapy_sessions SELECT policy already encodes (active member
-- AND active clinic_client/therapy_client). EXISTS evaluates that
-- under RLS, so school_admin / parent / non-member JWTs collapse to
-- FALSE here. No new helper required.
CREATE POLICY "select_therapy_session_notes"
  ON therapy_session_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
       WHERE ts.id = therapy_session_notes.therapy_session_id
    )
  );


-- 3.B — INSERT: caller is clinic_admin or therapist of the parent
-- session's clinic AND the session is NOT cancelled. authored_by
-- pinned to auth.uid().
--
-- NB: outer NEW-row references qualified as `therapy_session_notes.x`
-- to avoid the column-shadowing bug fixed in 082.
CREATE POLICY "clinic_staff_insert_therapy_session_notes"
  ON therapy_session_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    therapy_session_notes.authored_by_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM therapy_sessions ts
        JOIN organization_memberships om
          ON om.organization_id = ts.clinic_organization_id
       WHERE ts.id              = therapy_session_notes.therapy_session_id
         AND ts.status         <> 'cancelled'
         AND om.profile_id      = auth.uid()
         AND om.role            IN ('clinic_admin', 'therapist')
         AND om.status          = 'active'
    )
  );


-- 3.C — UPDATE: same predicate as INSERT (clinic_admin/therapist of
-- session's clinic AND session not cancelled). Column-guard 2.A
-- keeps therapy_session_id + authored_by_profile_id immutable;
-- everything else is mutable.
CREATE POLICY "clinic_staff_update_therapy_session_notes"
  ON therapy_session_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM therapy_sessions ts
        JOIN organization_memberships om
          ON om.organization_id = ts.clinic_organization_id
       WHERE ts.id              = therapy_session_notes.therapy_session_id
         AND ts.status         <> 'cancelled'
         AND om.profile_id      = auth.uid()
         AND om.role            IN ('clinic_admin', 'therapist')
         AND om.status          = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM therapy_sessions ts
        JOIN organization_memberships om
          ON om.organization_id = ts.clinic_organization_id
       WHERE ts.id              = therapy_session_notes.therapy_session_id
         AND ts.status         <> 'cancelled'
         AND om.profile_id      = auth.uid()
         AND om.role            IN ('clinic_admin', 'therapist')
         AND om.status          = 'active'
    )
  );

-- DELETE — no policy → denied for non-super-admin. Notes are
-- preserved for clinical audit. Use UPDATE to clear fields.

CREATE POLICY "super_admin_all_therapy_session_notes"
  ON therapy_session_notes
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ============================================================
-- End of Migration 083
-- ============================================================

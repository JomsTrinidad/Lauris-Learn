-- ============================================================
-- Migration 074 — child_profile_access_grants (Phase 4)
--
-- Purpose:
--   Introduce explicit, time-bounded, revocable, auditable consent
--   records that authorize a target organization (clinic / medical
--   practice) to read a child's identity (`child_profiles`).
--
-- Phase boundary (deliberate):
--   Phase 3 = LINKING ONLY                    — relationships in
--                                               organization_memberships
--                                               and child_profile_memberships.
--                                               No identity visibility.
--   Phase 4 = CONSENT + IDENTITY VISIBILITY   ← THIS MIGRATION
--             scope = 'identity_only' is the only honoured value.
--             child_identifiers stay HIDDEN to clinics.
--   Phase 5 = identifier sharing + cross-org document sharing.
--
-- What clinic users gain in Phase 4 (with an active grant):
--   ✅ child_profiles row of the granted child (display_name, names,
--      DOB, demographics)
--
-- What stays hidden in Phase 4 (verified by smoke test):
--   ❌ child_identifiers (LRN, passport, …) — Phase 5
--   ❌ child_documents, student_plans, students, schools, billing,
--      enrollments, parent_updates, events, external_contacts —
--      gated by school-scoped RLS, no clinic arm anywhere.
--
-- Updated helper:
--   - caller_visible_child_profile_ids() — fifth arm: any user with
--     an active organization_memberships row in the target org of an
--     active, currently-valid grant → that grant's child_profile.
--     Existing four arms are byte-identical; Lauris Learn behaviour
--     for school_admin / teacher / parent / super_admin is unchanged.
--
-- New helper (NO-OP in Phase 4, ready for Phase 5):
--   - caller_visible_child_profile_ids_for_identifiers()
--     Same body as the main helper MINUS the grant arm. Phase 5 will
--     flip the `child_identifiers` SELECT policy to use this helper
--     and then add an identifier-aware grant arm (or a separate
--     identifier-grant table). Shipping it as a no-op now makes
--     Phase 5 a one-line policy change.
--
-- Reused project-wide helpers:
--   set_updated_at()              — schema.sql
--   audit_log_trigger()           — migration 036
--   is_super_admin()              — migration 002
--   current_user_role()           — migration 031
--   current_user_school_id()      — migration 031
--   parent_student_ids()          — migration 026
--   teacher_visible_student_ids() — migration 056 (patched 066)
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS child_profile_access_grants (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What is being shared
  child_profile_id            UUID         NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  scope                       TEXT         NOT NULL DEFAULT 'identity_only',

  -- Who is sharing → who is receiving
  source_organization_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  target_organization_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  -- Authoriser (audit; granted_by_kind is a snapshot of role-at-time-of-grant)
  granted_by_profile_id       UUID         NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  granted_by_kind             TEXT         NOT NULL,
  purpose                     TEXT,

  -- Lifecycle
  status                      TEXT         NOT NULL DEFAULT 'active',
  valid_from                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  valid_until                 TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
  revoked_at                  TIMESTAMPTZ,
  revoked_by_profile_id       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  revoke_reason               TEXT,

  -- Bookkeeping
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT cpag_scope_valid
    CHECK (scope IN ('identity_only','identity_with_identifiers')),
  CONSTRAINT cpag_status_valid
    CHECK (status IN ('active','revoked','expired')),
  CONSTRAINT cpag_granted_by_kind_valid
    CHECK (granted_by_kind IN ('parent','school_admin','super_admin')),
  CONSTRAINT cpag_source_target_distinct
    CHECK (source_organization_id <> target_organization_id),
  CONSTRAINT cpag_valid_window
    CHECK (valid_until > valid_from)
);

-- One ACTIVE grant per (child, target_org). Replacing a grant means
-- revoke-then-insert. Revoked/expired rows are excluded so they don't
-- block a fresh grant.
CREATE UNIQUE INDEX IF NOT EXISTS cpag_active_unique_idx
  ON child_profile_access_grants (child_profile_id, target_organization_id)
  WHERE status = 'active';

-- Helper hot path: clinic-side visibility check
CREATE INDEX IF NOT EXISTS idx_cpag_target_status
  ON child_profile_access_grants (target_organization_id, status);

-- School-side audit views: "all grants for this child"
CREATE INDEX IF NOT EXISTS idx_cpag_child_status
  ON child_profile_access_grants (child_profile_id, status);

-- School-admin audit views: "all grants from this school"
CREATE INDEX IF NOT EXISTS idx_cpag_source
  ON child_profile_access_grants (source_organization_id);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- updated_at maintenance
DROP TRIGGER IF EXISTS set_child_profile_access_grants_updated_at ON child_profile_access_grants;
CREATE TRIGGER set_child_profile_access_grants_updated_at
  BEFORE UPDATE ON child_profile_access_grants
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- DML audit (school_id fallback to actor's profile via 036's contract)
DROP TRIGGER IF EXISTS audit_child_profile_access_grants ON child_profile_access_grants;
CREATE TRIGGER audit_child_profile_access_grants
  AFTER INSERT OR UPDATE OR DELETE ON child_profile_access_grants
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- Column-guard trigger.
-- Mirrors the document_access_grants column guard (4.2 in 056).
-- Only the lifecycle columns (status, revoked_*, valid_until) and
-- updated_at are mutable. Everything else is immutable — changing
-- the resource being shared, the parties, or the scope means
-- revoke-and-regrant, not edit.
--
-- super_admin bypasses the guard so data fixes are still possible
-- in support situations.
CREATE OR REPLACE FUNCTION cpag_column_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.child_profile_id IS DISTINCT FROM OLD.child_profile_id THEN
    RAISE EXCEPTION 'child_profile_id is immutable on child_profile_access_grants';
  END IF;
  IF NEW.source_organization_id IS DISTINCT FROM OLD.source_organization_id THEN
    RAISE EXCEPTION 'source_organization_id is immutable on child_profile_access_grants';
  END IF;
  IF NEW.target_organization_id IS DISTINCT FROM OLD.target_organization_id THEN
    RAISE EXCEPTION 'target_organization_id is immutable on child_profile_access_grants';
  END IF;
  IF NEW.granted_by_profile_id IS DISTINCT FROM OLD.granted_by_profile_id THEN
    RAISE EXCEPTION 'granted_by_profile_id is immutable on child_profile_access_grants';
  END IF;
  IF NEW.granted_by_kind IS DISTINCT FROM OLD.granted_by_kind THEN
    RAISE EXCEPTION 'granted_by_kind is immutable on child_profile_access_grants';
  END IF;
  IF NEW.scope IS DISTINCT FROM OLD.scope THEN
    RAISE EXCEPTION 'scope is immutable on child_profile_access_grants — revoke and re-grant';
  END IF;
  IF NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    RAISE EXCEPTION 'purpose is immutable on child_profile_access_grants';
  END IF;
  IF NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN
    RAISE EXCEPTION 'valid_from is immutable on child_profile_access_grants';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable on child_profile_access_grants';
  END IF;

  -- Mutable columns:
  --   status, valid_until, revoked_at, revoked_by_profile_id,
  --   revoke_reason, updated_at
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cpag_column_guard_trigger ON child_profile_access_grants;
CREATE TRIGGER cpag_column_guard_trigger
  BEFORE UPDATE ON child_profile_access_grants
  FOR EACH ROW EXECUTE FUNCTION cpag_column_guard();


-- ════════════════════════════════════════════════════════════════
-- 3. RLS HELPER UPDATES
-- ════════════════════════════════════════════════════════════════

-- 3.1 caller_visible_child_profile_ids() — fifth arm
--
-- Existing four arms (super_admin / school_admin / teacher / parent)
-- are byte-identical to migration 071's body. The fifth arm is gated
-- by:
--   - active organization_memberships row for the caller
--   - active grant in the matching target_organization_id
--   - currently within the grant's valid window
--
-- Lauris Learn users (no organization_memberships) get nothing from
-- this arm — their visibility is unchanged.
CREATE OR REPLACE FUNCTION caller_visible_child_profile_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT cp_id), ARRAY[]::UUID[])
  FROM (
    -- super_admin → everything
    SELECT cp.id AS cp_id
      FROM child_profiles cp
      WHERE is_super_admin()

    UNION

    -- school_admin → linked from students in their school
    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'school_admin'
        AND s.school_id = current_user_school_id()

    UNION

    -- teacher → linked from teacher-visible students
    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'teacher'
        AND s.id = ANY(teacher_visible_student_ids())

    UNION

    -- parent → linked from guardian-bound students
    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'parent'
        AND s.id = ANY(parent_student_ids())

    UNION

    -- Phase 4 NEW arm: clinic users with an active membership in the
    -- target org of an active, currently-valid grant.
    SELECT g.child_profile_id
      FROM child_profile_access_grants g
      JOIN organization_memberships m
        ON m.organization_id = g.target_organization_id
     WHERE g.status = 'active'
       AND g.valid_until > NOW()
       AND m.profile_id = auth.uid()
       AND m.status = 'active'
  ) t;
$$;


-- 3.2 caller_visible_child_profile_ids_for_identifiers() — NEW
--
-- Body identical to the main helper EXCLUDING the grant arm. Reserved
-- for Phase 5 — child_identifiers SELECT policy will switch to this
-- helper, and Phase 5 will then add an identifier-aware grant arm
-- (or a separate identifier-grant table).
--
-- Phase 4 ships this helper as a NO-OP — nothing reads it yet. It is
-- here purely so Phase 5 doesn't need to introduce a new helper at
-- the same time it changes a sensitive RLS policy.
CREATE OR REPLACE FUNCTION caller_visible_child_profile_ids_for_identifiers()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT cp_id), ARRAY[]::UUID[])
  FROM (
    SELECT cp.id AS cp_id
      FROM child_profiles cp
      WHERE is_super_admin()

    UNION

    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'school_admin'
        AND s.school_id = current_user_school_id()

    UNION

    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'teacher'
        AND s.id = ANY(teacher_visible_student_ids())

    UNION

    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'parent'
        AND s.id = ANY(parent_student_ids())

    -- Intentionally NO grant arm here. Phase 5 will add identifier
    -- sharing via this helper.
  ) t;
$$;


-- ════════════════════════════════════════════════════════════════
-- 4. RLS POLICIES — child_profile_access_grants
-- ════════════════════════════════════════════════════════════════

ALTER TABLE child_profile_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_visible_child_profile_access_grants"      ON child_profile_access_grants;
DROP POLICY IF EXISTS "school_admin_insert_child_profile_access_grants" ON child_profile_access_grants;
DROP POLICY IF EXISTS "school_admin_update_child_profile_access_grants" ON child_profile_access_grants;
DROP POLICY IF EXISTS "super_admin_all_child_profile_access_grants"     ON child_profile_access_grants;

-- ─────────────────────────────────────────────────────────────────
-- 4.1 SELECT
-- Asymmetric on purpose:
--   - SCHOOL SIDE (anyone whose visibility set already covers the
--     child_profile) — sees ALL grants for that child, including
--     revoked/expired ones (audit history).
--   - CLINIC SIDE (members of the target org) — sees ACTIVE grants
--     ONLY. Defense-in-depth: even though the helper filters expired
--     grants out of caller_visible_child_profile_ids() and ended
--     memberships out of caller_visible_organization_ids(), the
--     `status = 'active'` clamp here ensures clinic users cannot see
--     historical revoked rows that targeted them.
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "select_visible_child_profile_access_grants"
  ON child_profile_access_grants
  FOR SELECT
  TO authenticated
  USING (
    -- school side: anyone who can already see the child_profile
    child_profile_id = ANY(caller_visible_child_profile_ids())
    -- clinic side: target-org member, ACTIVE grants only
    OR (
      target_organization_id = ANY(caller_visible_organization_ids())
      AND status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 4.2 INSERT
-- school_admin only in Phase 4. parent/clinic-admin self-grant
-- paths land in later phases.
--   - Caller must be school_admin
--   - granted_by_profile_id must equal auth.uid()
--   - granted_by_kind must equal 'school_admin'
--   - source_organization_id must be the school_admin's school org
--   - The child_profile must be linked to a student in the admin's
--     school (so the school is actually authorised to share it)
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "school_admin_insert_child_profile_access_grants"
  ON child_profile_access_grants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND granted_by_profile_id = auth.uid()
    AND granted_by_kind = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = source_organization_id
        AND o.kind = 'school'
        AND o.school_id = current_user_school_id()
    )
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.child_profile_id = child_profile_access_grants.child_profile_id
        AND s.school_id = current_user_school_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 4.3 UPDATE
-- school_admin can update grants their own school issued. The
-- column-guard trigger (cpag_column_guard) restricts WHICH columns
-- they may change — only lifecycle (status, valid_until, revoked_*).
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "school_admin_update_child_profile_access_grants"
  ON child_profile_access_grants
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = source_organization_id
        AND o.kind = 'school'
        AND o.school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = source_organization_id
        AND o.kind = 'school'
        AND o.school_id = current_user_school_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 4.4 super_admin bypass
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "super_admin_all_child_profile_access_grants"
  ON child_profile_access_grants
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- DELETE — no policy → denied. Revoke (status='revoked'), don't delete.


-- ════════════════════════════════════════════════════════════════
-- 5. NO BACKFILL
--
-- Phase 4 starts with an empty grants table. Lauris Learn has no
-- existing cross-org identity sharing to migrate.
-- ════════════════════════════════════════════════════════════════


-- ============================================================
-- End of Migration 074
-- ============================================================

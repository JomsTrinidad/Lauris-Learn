-- ============================================================
-- Migration 039 – Phase 1.1 Hardening (additive only)
--
-- Changes:
--   1. Fix parents_select_class_updates — exclude deleted/hidden posts
--      from the parent portal. Previously parents could see soft-deleted
--      and hidden updates because the policy had no status filter.
--
--   2. Tighten students table write policies — replace broad
--      "any school member can insert/update/delete students" with
--      "school_admin only" (matches the UI intent and mirrors how
--      billing_records and other sensitive tables are already gated).
--      Teachers retain full SELECT access.
--      NOTE: Schools where teachers currently add/edit students via the
--      UI will need to grant those teachers school_admin role, or the
--      admin must perform student management.
--
-- No destructive changes: all DROPs are for policies being replaced
-- with tighter equivalents. Table structures are unchanged.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. parent_updates — fix parent visibility to exclude soft-deleted / hidden
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 026 defined parents_select_class_updates without a status filter.
-- The admin UI already uses soft-delete (status = 'deleted'/'hidden') but the
-- parent RLS policy was never updated to honour that status, meaning parents
-- could potentially read posts that admins had hidden or soft-deleted.

DROP POLICY IF EXISTS "parents_select_class_updates" ON parent_updates;

CREATE POLICY "parents_select_class_updates"
  ON parent_updates FOR SELECT
  USING (
    -- Only surface actively posted content to parents
    status = 'posted'
    AND (
      -- School-wide broadcast (class_id IS NULL)
      class_id IS NULL
      OR
      -- Class-specific update in a class the parent's child is enrolled in
      class_id IN (
        SELECT e.class_id FROM enrollments e
        WHERE e.student_id = ANY(parent_student_ids())
      )
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. students — restrict writes to school_admin
-- ═══════════════════════════════════════════════════════════════════════════════
-- Original schema.sql policies allowed any school member to insert/update/delete
-- student records. This is over-permissive: only school admins should manage
-- the student roster. Teachers need read-only access (existing SELECT policy
-- "School members can view students" is unchanged here).

-- Drop the broad school-member write policies added in schema.sql
DROP POLICY IF EXISTS "School members can insert students" ON students;
DROP POLICY IF EXISTS "School members can update students" ON students;
DROP POLICY IF EXISTS "School members can delete students" ON students;

-- school_admin: full write access within their own school
CREATE POLICY "school_admin_insert_students"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

CREATE POLICY "school_admin_update_students"
  ON students FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

CREATE POLICY "school_admin_delete_students"
  ON students FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

-- super_admin: full write bypass (migration 002 added SELECT-only bypass;
-- we add a write bypass here for impersonation / support scenarios).
DROP POLICY IF EXISTS "super_admin_write_students" ON students;
CREATE POLICY "super_admin_write_students"
  ON students FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

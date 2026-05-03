-- ──────────────────────────────────────────────────────────────────────────
-- Migration 066 — teacher_profiles ↔ auth.users bridge
--
-- Background
--   Migration 058 re-pointed class_teachers.teacher_id at teacher_profiles(id).
--   teacher_profiles is a standalone table — its IDs are gen_random_uuid(),
--   *not* auth.users.id. Three RLS helpers/policies still compare the join
--   key to auth.uid():
--
--     - teacher_visible_student_ids()  (056)
--     - teacher_student_ids()          (037, used by proud_moments)
--     - teacher_insert_parent_updates  (031, RLS policy on parent_updates)
--
--   Net effect since 058: any user signed in with role='teacher' fails RLS
--   on child_documents reads, parent_updates inserts, and proud_moments
--   visibility, because the join produces zero rows. School_admin paths
--   are unaffected.
--
-- Fix
--   1. Add a nullable, unique auth_user_id column on teacher_profiles
--      pointing at auth.users(id).
--   2. Backfill on (school_id, lower(email)) match against profiles where
--      role = 'teacher'.
--   3. Re-emit the three helpers/policy to resolve through the bridge:
--        auth.uid() → teacher_profiles.id → class_teachers.teacher_id
--
--   No data destruction. Rows that don't backfill stay NULL — the teacher
--   record continues to work for class assignment, the user just can't
--   sign in as that teacher until linked. Re-linking is a single UPDATE
--   today; a Settings UI for it can land later.
--
--   Idempotent on re-run: the column add uses IF NOT EXISTS, the backfill
--   only fills NULL rows, and the helpers / policy use CREATE OR REPLACE
--   / DROP IF EXISTS.
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Bridge column ──────────────────────────────────────────────────────

ALTER TABLE teacher_profiles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE teacher_profiles
    ADD CONSTRAINT teacher_profiles_auth_user_id_key UNIQUE (auth_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS teacher_profiles_auth_user_id_idx
  ON teacher_profiles(auth_user_id)
  WHERE auth_user_id IS NOT NULL;


-- ── 2. Best-effort backfill ───────────────────────────────────────────────

UPDATE teacher_profiles tp
   SET auth_user_id = p.id
  FROM profiles p
 WHERE tp.auth_user_id IS NULL
   AND tp.email IS NOT NULL
   AND p.email IS NOT NULL
   AND lower(tp.email) = lower(p.email)
   AND p.school_id    = tp.school_id
   AND p.role         = 'teacher';


-- ── 3. Re-emit RLS helpers + policy through the bridge ────────────────────

-- 3.1 teacher_visible_student_ids — child_documents accessor
CREATE OR REPLACE FUNCTION teacher_visible_student_ids()
  RETURNS UUID[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT e.student_id
      FROM   teacher_profiles tp
      JOIN   class_teachers ct ON ct.teacher_id = tp.id
      JOIN   enrollments    e  ON e.class_id    = ct.class_id
      WHERE  tp.auth_user_id = auth.uid()
        AND  e.status        = 'enrolled'
    ),
    '{}'::UUID[]
  );
$$;

-- 3.2 teacher_student_ids — proud_moments accessor (mirrors 3.1)
CREATE OR REPLACE FUNCTION teacher_student_ids()
  RETURNS UUID[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT e.student_id
    FROM   teacher_profiles tp
    JOIN   class_teachers ct ON ct.teacher_id = tp.id
    JOIN   enrollments    e  ON e.class_id    = ct.class_id
    WHERE  tp.auth_user_id = auth.uid()
      AND  e.status        = 'enrolled'
  );
$$;

-- 3.3 teacher_insert_parent_updates policy — bridge subquery
DROP POLICY IF EXISTS "teacher_insert_parent_updates" ON parent_updates;
CREATE POLICY "teacher_insert_parent_updates"
  ON parent_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND class_id IN (
      SELECT ct.class_id
        FROM teacher_profiles tp
        JOIN class_teachers   ct ON ct.teacher_id = tp.id
       WHERE tp.auth_user_id = auth.uid()
    )
  );

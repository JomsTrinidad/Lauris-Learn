-- ============================================================
-- Migration 037 – Proud Moments Hardening
--
-- Changes:
--   1. Add soft-delete columns (deleted_at, deleted_by) to proud_moments
--   2. Helper: teacher_student_ids() — students enrolled in teacher's classes
--   3. Drop and replace all proud_moments SELECT/INSERT/DELETE policies:
--      - SELECT: filter out soft-deleted rows (deleted_at IS NULL)
--      - INSERT: school_admin unrestricted; teacher scoped to assigned classes
--      - UPDATE: school_admin can edit note/category and soft-delete any moment;
--                creator can soft-delete their own moment
--      - Hard DELETE: school_admin only (for true erasure)
--   4. Tighten proud_moment_reactions INSERT: verify the moment belongs to the
--      parent's child (not just any moment the parent knows the UUID of)
-- ============================================================


-- ─── 1. Soft-delete columns ───────────────────────────────────────────────────

ALTER TABLE proud_moments
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;


-- ─── 2. Helper: teacher_student_ids() ────────────────────────────────────────
-- Returns the UUIDs of all currently-enrolled students in classes where
-- auth.uid() is a class teacher. SECURITY DEFINER so the subquery can read
-- class_teachers and enrollments without hitting recursive RLS policies.

CREATE OR REPLACE FUNCTION teacher_student_ids()
  RETURNS UUID[]
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT e.student_id
    FROM   enrollments e
    JOIN   class_teachers ct ON ct.class_id = e.class_id
    WHERE  ct.teacher_id = auth.uid()
      AND  e.status = 'enrolled'
  );
$$;


-- ─── 3. proud_moments policies ───────────────────────────────────────────────

-- Drop all existing policies first (idempotent re-run safety)
DROP POLICY IF EXISTS "staff_select_proud_moments"         ON proud_moments;
DROP POLICY IF EXISTS "staff_insert_proud_moments"         ON proud_moments;
DROP POLICY IF EXISTS "staff_delete_proud_moments"         ON proud_moments;
DROP POLICY IF EXISTS "parents_select_proud_moments"       ON proud_moments;
DROP POLICY IF EXISTS "super_admin_all_proud_moments"      ON proud_moments;
DROP POLICY IF EXISTS "school_admin_insert_proud_moments"  ON proud_moments;
DROP POLICY IF EXISTS "teacher_insert_proud_moments"       ON proud_moments;
DROP POLICY IF EXISTS "school_admin_update_proud_moments"  ON proud_moments;
DROP POLICY IF EXISTS "creator_softdelete_proud_moments"   ON proud_moments;
DROP POLICY IF EXISTS "school_admin_delete_proud_moments"  ON proud_moments;


-- SELECT: staff see non-deleted moments in their school
CREATE POLICY "staff_select_proud_moments" ON proud_moments
  FOR SELECT USING (
    deleted_at IS NULL
    AND school_id = current_user_school_id()
  );

-- SELECT: parents see non-deleted moments for their own children
CREATE POLICY "parents_select_proud_moments" ON proud_moments
  FOR SELECT USING (
    deleted_at IS NULL
    AND student_id = ANY(parent_student_ids())
  );

-- INSERT: school_admin can record a moment for any student in their school
CREATE POLICY "school_admin_insert_proud_moments" ON proud_moments
  FOR INSERT WITH CHECK (
    current_user_role() IN ('school_admin')
    AND school_id = current_user_school_id()
  );

-- INSERT: teacher can only record a moment for students in their assigned classes
CREATE POLICY "teacher_insert_proud_moments" ON proud_moments
  FOR INSERT WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_student_ids())
  );

-- UPDATE: school_admin can edit note/category and soft-delete any moment in school
CREATE POLICY "school_admin_update_proud_moments" ON proud_moments
  FOR UPDATE USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

-- UPDATE: the creator can soft-delete (set deleted_at) their own moment
CREATE POLICY "creator_softdelete_proud_moments" ON proud_moments
  FOR UPDATE USING (
    created_by = auth.uid()
  );

-- Hard DELETE: school_admin only (for true data erasure; creator uses soft-delete)
CREATE POLICY "school_admin_delete_proud_moments" ON proud_moments
  FOR DELETE USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

-- Super admin bypass (all operations, including hard DELETE)
CREATE POLICY "super_admin_all_proud_moments" ON proud_moments
  FOR ALL USING (is_super_admin());


-- ─── 4. proud_moment_reactions policies ──────────────────────────────────────

-- Drop existing broad "all" policy and replace with specific INSERT/SELECT/DELETE
DROP POLICY IF EXISTS "parents_all_reactions"     ON proud_moment_reactions;
DROP POLICY IF EXISTS "staff_select_reactions"    ON proud_moment_reactions;
DROP POLICY IF EXISTS "super_admin_all_reactions" ON proud_moment_reactions;

-- SELECT: parents see their own reactions
CREATE POLICY "parents_select_reactions" ON proud_moment_reactions
  FOR SELECT USING (parent_id = auth.uid());

-- INSERT: parent may react only to a non-deleted moment belonging to their child.
-- This prevents reacting to moments for other children even if the UUID is known.
CREATE POLICY "parents_insert_reactions" ON proud_moment_reactions
  FOR INSERT WITH CHECK (
    parent_id = auth.uid()
    AND proud_moment_id IN (
      SELECT id FROM proud_moments
      WHERE  student_id = ANY(parent_student_ids())
        AND  deleted_at IS NULL
    )
  );

-- UPDATE (upsert path): same ownership + child ownership check
CREATE POLICY "parents_update_reactions" ON proud_moment_reactions
  FOR UPDATE USING (parent_id = auth.uid())
  WITH CHECK (
    parent_id = auth.uid()
    AND proud_moment_id IN (
      SELECT id FROM proud_moments
      WHERE  student_id = ANY(parent_student_ids())
        AND  deleted_at IS NULL
    )
  );

-- DELETE: parent can remove their own reaction
CREATE POLICY "parents_delete_reactions" ON proud_moment_reactions
  FOR DELETE USING (parent_id = auth.uid());

-- Staff see all reactions on moments within their school
CREATE POLICY "staff_select_reactions" ON proud_moment_reactions
  FOR SELECT USING (
    proud_moment_id IN (
      SELECT id FROM proud_moments
      WHERE school_id = current_user_school_id()
    )
  );

-- Super admin bypass
CREATE POLICY "super_admin_all_reactions" ON proud_moment_reactions
  FOR ALL USING (is_super_admin());

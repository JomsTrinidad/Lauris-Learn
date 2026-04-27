-- ============================================================
-- Migration 031 – RLS Tenant Hardening
-- Hardens policies on: progress_observations, parent_updates, absence_notifications
--
-- Changes per table:
--   progress_observations  — replace broad INSERT, add UPDATE/DELETE + super_admin write
--   parent_updates         — replace broad INSERT (add role+class scope), replace UPDATE
--                            (add ownership), add DELETE + super_admin write
--   absence_notifications  — add super_admin bypass, add school_admin DELETE
--
-- Helper functions created here:
--   current_user_role()      — returns the caller's user_role enum value
--   current_user_school_id() — returns the caller's school_id UUID
--   Both are STABLE SECURITY DEFINER so Postgres evaluates them once per query,
--   not once per row — critical for keeping RLS policy overhead low.
-- ============================================================


-- ─── Helper functions ─────────────────────────────────────────────────────────

-- Returns the authenticated caller's role from the profiles table.
-- STABLE: safe result within a single transaction; Postgres caches it per query.
-- SECURITY DEFINER: reads profiles bypassing RLS (profiles has its own policies).
CREATE OR REPLACE FUNCTION current_user_role()
  RETURNS user_role
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Returns the authenticated caller's school_id from the profiles table.
-- Returns NULL for parents and unenrolled users (they have no school_id).
CREATE OR REPLACE FUNCTION current_user_school_id()
  RETURNS UUID
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid();
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. progress_observations
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Drop the old broad INSERT policy (no role check) ──────────────────────────
-- The original policy allowed any school member to insert, relying on parents
-- having NULL school_id to be implicitly excluded. We replace it with an
-- explicit role-gated policy.
DROP POLICY IF EXISTS "School members can insert observations" ON progress_observations;


-- ── school_admin: full read/write within their school ─────────────────────────

-- INSERT: school_admin can record observations for any student in their school.
CREATE POLICY "school_admin_insert_observations"
  ON progress_observations FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND student_id IN (
      SELECT id FROM students WHERE school_id = current_user_school_id()
    )
  );

-- UPDATE: school_admin can edit any observation for students in their school.
CREATE POLICY "school_admin_update_observations"
  ON progress_observations FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND student_id IN (
      SELECT id FROM students WHERE school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND student_id IN (
      SELECT id FROM students WHERE school_id = current_user_school_id()
    )
  );

-- DELETE: school_admin can remove any observation in their school.
CREATE POLICY "school_admin_delete_observations"
  ON progress_observations FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND student_id IN (
      SELECT id FROM students WHERE school_id = current_user_school_id()
    )
  );


-- ── teacher: read/write own observations only ─────────────────────────────────

-- INSERT: teacher can record observations for any student in their school.
-- (Observations are general developmental assessments; restricting to assigned
--  classes would prevent observations at school-wide activities.)
-- observed_by must be set to the teacher's own profile ID to allow future UPDATE/DELETE.
CREATE POLICY "teacher_insert_observations"
  ON progress_observations FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'teacher'
    AND student_id IN (
      SELECT id FROM students WHERE school_id = current_user_school_id()
    )
  );

-- UPDATE: teachers can only edit their own recorded observations (observed_by = auth.uid()).
CREATE POLICY "teacher_update_own_observations"
  ON progress_observations FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND observed_by = auth.uid()
  )
  WITH CHECK (
    current_user_role() = 'teacher'
    AND observed_by = auth.uid()
  );

-- DELETE: teachers can only remove observations they themselves recorded.
CREATE POLICY "teacher_delete_own_observations"
  ON progress_observations FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND observed_by = auth.uid()
  );


-- ── super_admin: full read/write across all schools ───────────────────────────
-- Migration 002 added a SELECT-only bypass ("super_admin_read_progress_obs").
-- We add a separate write bypass so super_admin can manage observations during
-- impersonation or support.
CREATE POLICY "super_admin_write_observations"
  ON progress_observations FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Note: parents are intentionally excluded from all write policies above.
-- Their existing SELECT policy ("parents_select_progress_observations" from
-- migration 016) limits reads to visibility = 'parent_visible' for own children.
-- No further change needed for parents on this table.


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. parent_updates
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Drop old broad INSERT and UPDATE policies ──────────────────────────────────
-- "School members can insert parent_updates": no role check, no class ownership —
--   any school member (teacher) could post to any class, including other teachers'.
-- "School members can update parent_updates": no ownership check —
--   any school member could edit any other teacher's post.
DROP POLICY IF EXISTS "School members can insert parent_updates"  ON parent_updates;
DROP POLICY IF EXISTS "School members can update parent_updates"  ON parent_updates;


-- ── school_admin: full read/write within their school ─────────────────────────

-- INSERT: school_admin can post to any class in their school, or broadcast
-- (class_id IS NULL = school-wide announcement visible to all parents).
CREATE POLICY "school_admin_insert_parent_updates"
  ON parent_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
    AND (
      class_id IS NULL
      OR class_id IN (SELECT id FROM classes WHERE school_id = current_user_school_id())
    )
  );

-- UPDATE: school_admin can edit any post in their school (e.g. to remove inappropriate content).
CREATE POLICY "school_admin_update_parent_updates"
  ON parent_updates FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

-- DELETE: school_admin can remove any post in their school.
CREATE POLICY "school_admin_delete_parent_updates"
  ON parent_updates FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );


-- ── teacher: scoped to assigned classes; can only edit own posts ───────────────

-- INSERT: teachers can only post to classes they are assigned to (class_teachers).
-- Broadcasts (class_id IS NULL) are school_admin only.
-- This prevents a teacher from posting updates to another teacher's class.
CREATE POLICY "teacher_insert_parent_updates"
  ON parent_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND class_id IN (
      SELECT class_id FROM class_teachers WHERE teacher_id = auth.uid()
    )
  );

-- UPDATE: teachers can only edit posts they authored.
CREATE POLICY "teacher_update_own_parent_updates"
  ON parent_updates FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND author_id = auth.uid()
  )
  WITH CHECK (
    current_user_role() = 'teacher'
    AND author_id = auth.uid()
  );

-- DELETE: teachers can only delete their own posts.
CREATE POLICY "teacher_delete_own_parent_updates"
  ON parent_updates FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND author_id = auth.uid()
  );


-- ── super_admin: full read/write across all schools ───────────────────────────
-- Migration 002 added a SELECT-only bypass ("super_admin_read_parent_updates").
-- We add a write bypass for impersonation and support scenarios.
CREATE POLICY "super_admin_write_parent_updates"
  ON parent_updates FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Note: parents have no write access to parent_updates.
-- Their SELECT is covered by "parents_select_class_updates" (migration 026).
-- No changes needed for parent read policies on this table.


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. absence_notifications
-- ═══════════════════════════════════════════════════════════════════════════════
-- Existing policies (migration 016) are correct:
--   "parents_insert_absence_notifications" — guardian email + student_id check ✓
--   "parents_select_absence_notifications" — guardian email + student_id check ✓
--   "school_members_select_absence_notifications" — school_id check (teachers/admins) ✓
-- We add the missing super_admin bypass and staff DELETE capability.

-- ── super_admin: full access ──────────────────────────────────────────────────
-- Previously, super_admin had NO policies on absence_notifications, making
-- absence reports invisible during impersonation and support sessions.
CREATE POLICY "super_admin_all_absence_notifications"
  ON absence_notifications FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ── school_admin: can delete erroneous notifications ─────────────────────────
-- Parents may accidentally submit duplicate or incorrect absence notifications.
-- school_admin should be able to clean those up. The unique constraint
-- (student_id, date) already prevents genuine duplicates, but erroneous entries
-- for the wrong date or wrong student need admin correction.
CREATE POLICY "school_admin_delete_absence_notifications"
  ON absence_notifications FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

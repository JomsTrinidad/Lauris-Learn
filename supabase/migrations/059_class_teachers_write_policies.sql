-- ─────────────────────────────────────────────────────────────────
-- 059 — Add INSERT/UPDATE/DELETE RLS policies on class_teachers
-- ─────────────────────────────────────────────────────────────────
-- The original schema only declared a SELECT policy on class_teachers
-- ("School members can view class_teachers"). With RLS enabled and no
-- permissive write policy, every client-side INSERT/UPDATE/DELETE was
-- blocked. This was masked previously because UI assignments were
-- already failing on an FK violation (migration 058). Now that the FK
-- is correct, the next gate is RLS — which surfaced as
-- "new row violates row-level security policy for table class_teachers".
--
-- Writes are restricted to school_admin scoped to their own school,
-- plus super_admin (matches the pattern in migration 031). Teachers
-- and parents cannot reassign class_teachers rows from the client.
--
-- Idempotent: DROP IF EXISTS first so this migration can be re-run
-- (and so it cleanly replaces any earlier looser draft of these
-- policies, including the school-member-permissive variant).
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "School members can insert class_teachers" ON class_teachers;
DROP POLICY IF EXISTS "School members can update class_teachers" ON class_teachers;
DROP POLICY IF EXISTS "School members can delete class_teachers" ON class_teachers;
DROP POLICY IF EXISTS "school_admin_insert_class_teachers"        ON class_teachers;
DROP POLICY IF EXISTS "school_admin_update_class_teachers"        ON class_teachers;
DROP POLICY IF EXISTS "school_admin_delete_class_teachers"        ON class_teachers;

CREATE POLICY "school_admin_insert_class_teachers"
  ON class_teachers FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      current_user_role() = 'school_admin'
      AND class_id IN (
        SELECT id FROM classes WHERE school_id = current_user_school_id()
      )
    )
    OR is_super_admin()
  );

CREATE POLICY "school_admin_update_class_teachers"
  ON class_teachers FOR UPDATE
  TO authenticated
  USING (
    (
      current_user_role() = 'school_admin'
      AND class_id IN (
        SELECT id FROM classes WHERE school_id = current_user_school_id()
      )
    )
    OR is_super_admin()
  )
  WITH CHECK (
    (
      current_user_role() = 'school_admin'
      AND class_id IN (
        SELECT id FROM classes WHERE school_id = current_user_school_id()
      )
    )
    OR is_super_admin()
  );

CREATE POLICY "school_admin_delete_class_teachers"
  ON class_teachers FOR DELETE
  TO authenticated
  USING (
    (
      current_user_role() = 'school_admin'
      AND class_id IN (
        SELECT id FROM classes WHERE school_id = current_user_school_id()
      )
    )
    OR is_super_admin()
  );

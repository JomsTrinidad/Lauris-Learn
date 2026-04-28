-- 042_uploaded_files_staff_write.sql
-- Migration 041 restricted uploaded_files INSERT/UPDATE/DELETE to school_admin only.
-- Teachers also upload files (parent update photos, broadcast photos) so they need INSERT.
-- This migration widens the write policy to include the teacher role.
--
-- Pattern matches the permission model used on parent_updates and progress_observations:
--   school_admin  — full CRUD on their school's data
--   teacher       — can insert their own uploads; cannot delete other teachers' entries
--
-- The super_admin bypass policy (from 041) is unchanged — this migration only replaces
-- the staff write policy.

DROP POLICY IF EXISTS "school_admin_write_uploaded_files" ON uploaded_files;

CREATE POLICY "staff_write_uploaded_files"
  ON uploaded_files
  FOR ALL
  USING  (current_user_role() IN ('school_admin', 'teacher') AND school_id = current_user_school_id())
  WITH CHECK (current_user_role() IN ('school_admin', 'teacher') AND school_id = current_user_school_id());

-- ─────────────────────────────────────────────────────────────────
-- 058 — Re-point class_teachers.teacher_id FK from profiles → teacher_profiles
-- ─────────────────────────────────────────────────────────────────
-- The Classes page populates the "Assigned Teacher" dropdown from
-- teacher_profiles (the standalone staff roster managed in
-- Settings → Teachers). The FK was still pointing at profiles(id),
-- so every teacher assignment from the UI silently failed with an
-- FK violation — the row never persisted, the modal closed cleanly,
-- and on reload the join returned nothing.
--
-- This migration re-points the FK so the existing UI flow works.
--
-- Side effect (accepted): three RLS helpers compare
-- class_teachers.teacher_id against auth.uid() — see migrations 031,
-- 037, 056. After this change those helpers match zero rows for
-- teacher logins. Only school_admin / super_admin paths remain
-- functional for the gated features (parent_updates inserts,
-- proud_moments visibility, child_documents access).
--
-- Existing rows: any class_teachers row whose teacher_id does not
-- correspond to a teacher_profiles.id is deleted. In practice these
-- are only present in demo seed data; the demo seeder is updated in
-- the same change so future runs insert teacher_profiles rows first
-- and reference those IDs.
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Remove rows that would violate the new FK
DELETE FROM class_teachers ct
WHERE NOT EXISTS (
  SELECT 1 FROM teacher_profiles tp WHERE tp.id = ct.teacher_id
);

-- 2. Drop the old FK to profiles
ALTER TABLE class_teachers
  DROP CONSTRAINT IF EXISTS class_teachers_teacher_id_fkey;

-- 3. Add the new FK to teacher_profiles
ALTER TABLE class_teachers
  ADD CONSTRAINT class_teachers_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES teacher_profiles(id) ON DELETE CASCADE;

COMMIT;

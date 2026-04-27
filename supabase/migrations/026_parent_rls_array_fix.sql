-- Migration 026: Fix parent_student_ids() — return UUID[] not SETOF UUID
-- SETOF (set-returning) functions are not allowed in RLS policy expressions.
-- Returning UUID[] and using = ANY(...) is the correct approach.

-- ── Drop policies that depend on the old function ─────────────────────────────────
DROP POLICY IF EXISTS "parents_select_own_children"         ON students;
DROP POLICY IF EXISTS "parents_select_own_enrollments"      ON enrollments;
DROP POLICY IF EXISTS "parents_select_enrolled_classes"     ON classes;
DROP POLICY IF EXISTS "parents_select_own_school"           ON schools;
DROP POLICY IF EXISTS "parents_select_own_school_years"     ON school_years;
DROP POLICY IF EXISTS "parents_select_own_attendance"       ON attendance_records;
DROP POLICY IF EXISTS "parents_select_class_updates"        ON parent_updates;
DROP POLICY IF EXISTS "parents_select_school_events"        ON events;
DROP POLICY IF EXISTS "parents_select_own_billing_records"  ON billing_records;
DROP POLICY IF EXISTS "parents_select_own_payments"         ON payments;
DROP POLICY IF EXISTS "parents_select_progress_categories"  ON progress_categories;

-- ── Replace the function with one that returns UUID[] ─────────────────────────────
CREATE OR REPLACE FUNCTION parent_student_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT student_id
    FROM guardians
    WHERE email = (auth.jwt() ->> 'email')
  );
$$;

-- ── Recreate all parent policies ──────────────────────────────────────────────────

CREATE POLICY "parents_select_own_children"
  ON students FOR SELECT
  USING (id = ANY(parent_student_ids()));

CREATE POLICY "parents_select_own_enrollments"
  ON enrollments FOR SELECT
  USING (student_id = ANY(parent_student_ids()));

CREATE POLICY "parents_select_enrolled_classes"
  ON classes FOR SELECT
  USING (
    id IN (
      SELECT e.class_id FROM enrollments e
      WHERE e.student_id = ANY(parent_student_ids())
    )
  );

CREATE POLICY "parents_select_own_school"
  ON schools FOR SELECT
  USING (
    id IN (
      SELECT s.school_id FROM students s
      WHERE s.id = ANY(parent_student_ids())
    )
  );

CREATE POLICY "parents_select_own_school_years"
  ON school_years FOR SELECT
  USING (
    school_id IN (
      SELECT s.school_id FROM students s
      WHERE s.id = ANY(parent_student_ids())
    )
  );

CREATE POLICY "parents_select_own_attendance"
  ON attendance_records FOR SELECT
  USING (student_id = ANY(parent_student_ids()));

CREATE POLICY "parents_select_class_updates"
  ON parent_updates FOR SELECT
  USING (
    class_id IS NULL
    OR class_id IN (
      SELECT e.class_id FROM enrollments e
      WHERE e.student_id = ANY(parent_student_ids())
    )
  );

CREATE POLICY "parents_select_school_events"
  ON events FOR SELECT
  USING (
    school_id IN (
      SELECT s.school_id FROM students s
      WHERE s.id = ANY(parent_student_ids())
    )
  );

CREATE POLICY "parents_select_own_billing_records"
  ON billing_records FOR SELECT
  USING (student_id = ANY(parent_student_ids()));

CREATE POLICY "parents_select_own_payments"
  ON payments FOR SELECT
  USING (
    billing_record_id IN (
      SELECT id FROM billing_records
      WHERE student_id = ANY(parent_student_ids())
    )
  );

CREATE POLICY "parents_select_progress_categories"
  ON progress_categories FOR SELECT
  USING (
    school_id IN (
      SELECT s.school_id FROM students s
      WHERE s.id = ANY(parent_student_ids())
    )
  );

-- Migration 024: Parent portal RLS policies
-- Parents sign in via magic link and have no school_id in their profile.
-- All existing policies are "school member" gated, which blocks parents entirely.
-- These policies let parents read data scoped to their own children only.
-- Pattern: match guardian.email = (auth.jwt() ->> 'email') — same as migration 016.

-- ── Core child data ─────────────────────────────────────────────────────────────

-- guardians: parent can see their own guardian record (drives all other lookups)
CREATE POLICY "parents_select_own_guardian_record"
  ON guardians FOR SELECT
  USING (email = (auth.jwt() ->> 'email'));

-- students: parent can see their children
CREATE POLICY "parents_select_own_children"
  ON students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = students.id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- enrollments: parent can see their children's enrollments
CREATE POLICY "parents_select_own_enrollments"
  ON enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = enrollments.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- classes: parent can see classes their children are enrolled in
CREATE POLICY "parents_select_enrolled_classes"
  ON classes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN guardians g ON g.student_id = e.student_id
      WHERE e.class_id = classes.id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- schools: parent can see their children's school (needed for branding fetch)
CREATE POLICY "parents_select_own_school"
  ON schools FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN guardians g ON g.student_id = s.id
      WHERE s.school_id = schools.id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- school_years: parent can see school years for their children's school
CREATE POLICY "parents_select_own_school_years"
  ON school_years FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN guardians g ON g.student_id = s.id
      WHERE s.school_id = school_years.school_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- ── Attendance ───────────────────────────────────────────────────────────────────

-- attendance_records: parent can see their children's attendance
CREATE POLICY "parents_select_own_attendance"
  ON attendance_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = attendance_records.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- ── Updates / feed ───────────────────────────────────────────────────────────────

-- parent_updates: parent can see updates for their children's class (and school-wide)
CREATE POLICY "parents_select_class_updates"
  ON parent_updates FOR SELECT
  USING (
    class_id IS NULL  -- school-wide broadcasts
    OR EXISTS (
      SELECT 1 FROM enrollments e
      JOIN guardians g ON g.student_id = e.student_id
      WHERE e.class_id = parent_updates.class_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- ── Events ───────────────────────────────────────────────────────────────────────

-- events: parent can see events for their children's school
CREATE POLICY "parents_select_school_events"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN guardians g ON g.student_id = s.id
      WHERE s.school_id = events.school_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- ── Billing ──────────────────────────────────────────────────────────────────────

-- billing_records: parent can see their children's billing records
CREATE POLICY "parents_select_own_billing_records"
  ON billing_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = billing_records.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- payments: parent can see payments on their children's billing records
CREATE POLICY "parents_select_own_payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM billing_records br
      JOIN guardians g ON g.student_id = br.student_id
      WHERE br.id = payments.billing_record_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- ── Progress ─────────────────────────────────────────────────────────────────────

-- progress_categories: parent can see categories for their children's school
CREATE POLICY "parents_select_progress_categories"
  ON progress_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN guardians g ON g.student_id = s.id
      WHERE s.school_id = progress_categories.school_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

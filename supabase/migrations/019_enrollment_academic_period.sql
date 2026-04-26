-- Migration 019: Add academic_period_id, start_date, end_date to enrollments
-- Enables multi-period enrollment (e.g., Summer + Kinder in the same school year)

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS academic_period_id UUID REFERENCES academic_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- Partial unique index: one enrollment per student per class per period
-- (allows multiple enrollments per student as long as class or period differs)
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_student_class_period_unique
  ON enrollments (student_id, class_id, academic_period_id)
  WHERE academic_period_id IS NOT NULL;

-- RLS passthrough for super_admin (consistent with other tables)
DROP POLICY IF EXISTS "super_admin_bypass_enrollments" ON enrollments;
CREATE POLICY "super_admin_bypass_enrollments" ON enrollments
  FOR ALL USING (is_super_admin());

-- Migration 027: Add DELETE policy on school_years
-- The schema only had INSERT + UPDATE policies; DELETE was missing,
-- causing silent RLS blocks when school admins tried to delete a school year.

CREATE POLICY "School members can delete school years"
  ON school_years FOR DELETE
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

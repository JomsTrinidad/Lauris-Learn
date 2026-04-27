-- 030_school_admin_write_policies.sql
-- Adds missing UPDATE/INSERT policies on schools and branches so that
-- school_admin users can save branding, school info, and code config.
-- Previously only SELECT was allowed; every write call silently returned
-- no rows updated (RLS blocked without raising an error).

-- ── schools ──────────────────────────────────────────────────────────────────

-- Allow school_admin to update their own school's settings (name, branding, etc.)
CREATE POLICY "school_admin_update_own_school"
  ON schools FOR UPDATE
  TO authenticated
  USING  (id IN (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'school_admin'))
  WITH CHECK (id IN (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'school_admin'));

-- ── branches ─────────────────────────────────────────────────────────────────

-- Allow school_admin to create a branch for their school
CREATE POLICY "school_admin_insert_branch"
  ON branches FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'school_admin'));

-- Allow school_admin to update branches that belong to their school
CREATE POLICY "school_admin_update_branch"
  ON branches FOR UPDATE
  TO authenticated
  USING  (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'school_admin'))
  WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'school_admin'));

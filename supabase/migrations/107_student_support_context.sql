-- Migration 107 — student_support_context (Phase 12 — Continuity Context)
--
-- Adds the school-side mirror of the Care `care_support_context` table from
-- Care's migration 094. School staff write a short, observational, ongoing
-- context line about a student ("Practicing independence during cleanup.",
-- "Getting comfortable joining group activities.", "Adjusting to a new
-- classroom routine."). Parents see it as a quiet ambient line on the
-- parent dashboard — framing context, not timeline content.
--
-- Voice contract (enforced by UX scaffolding, NOT by DB):
--   The text is meant to be OBSERVATIONAL, not interpretive. Examples like
--   "Improving executive function" or "Showing increased resilience" are
--   exactly what Phase 12 wants to avoid. The DB can't validate content;
--   the composer placeholder + helper text model the desired tone.
--
-- Cardinality: ONE current context per student (UNIQUE on student_id).
--   Replacing the text is an UPDATE. No history table — Phase 12 is "what
--   life currently feels like," not a longitudinal record.
--
-- Strictly additive: no changes to existing tables, no RPCs, no helpers.
-- Mirrors the care_support_context RLS shape: staff write within school,
-- parents read via parent_student_ids() (Learn migration 026 helper).

CREATE TABLE student_support_context (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID        NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id        UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  focus_text        TEXT        NOT NULL CHECK (trim(focus_text) <> ''),
  set_by_profile_id UUID        REFERENCES profiles(id)          ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);

CREATE INDEX student_support_context_student_idx ON student_support_context (student_id);
CREATE INDEX student_support_context_school_idx  ON student_support_context (school_id);

ALTER TABLE student_support_context ENABLE ROW LEVEL SECURITY;

-- Staff: read context for students in their school.
CREATE POLICY "ssc_staff_select" ON student_support_context
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );

-- Staff: insert context for students in their school.
CREATE POLICY "ssc_staff_insert" ON student_support_context
  FOR INSERT WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );

-- Staff: update context for students in their school.
CREATE POLICY "ssc_staff_update" ON student_support_context
  FOR UPDATE USING (
    school_id IN (
      SELECT school_id FROM profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );

-- Staff: delete (clear) context for students in their school.
CREATE POLICY "ssc_staff_delete" ON student_support_context
  FOR DELETE USING (
    school_id IN (
      SELECT school_id FROM profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );

-- Parents: read context for their linked students.
-- Uses the parent_student_ids() helper from Learn migration 026.
CREATE POLICY "ssc_parent_select" ON student_support_context
  FOR SELECT USING (
    student_id = ANY(parent_student_ids())
  );

-- Super admin: bypass for support / debugging.
CREATE POLICY "ssc_super_admin_all" ON student_support_context
  FOR ALL USING (is_super_admin());

-- Keep updated_at fresh on each UPDATE.
CREATE OR REPLACE FUNCTION student_support_context_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER student_support_context_updated_at_trigger
  BEFORE UPDATE ON student_support_context
  FOR EACH ROW
  EXECUTE FUNCTION student_support_context_set_updated_at();

-- Tell PostgREST to reload its schema cache so the new table is queryable
-- immediately via the REST surface (same pattern used by other migrations).
NOTIFY pgrst, 'reload schema';

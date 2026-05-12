-- ============================================================
-- Migration 090 – Discard Draft: teacher DELETE policy
--
-- Allows the plan's original creator (teacher) to hard-delete their own
-- draft IEP plans that have never progressed beyond draft status.
--
-- Eligibility gates (all must be true):
--   - caller is a teacher in the same school
--   - plan was created by the caller (auth.uid())
--   - status = 'draft'
--   - submitted_at, finalized_at, approved_at are all NULL
--
-- school_admin can already DELETE any plan via the FOR ALL policy
-- added in migration 070 (school_admin_all_student_plans).
--
-- All sub-rows (goals, interventions, progress entries, attachments,
-- evidence assistant rows) cascade automatically via ON DELETE CASCADE.
-- ============================================================

CREATE POLICY "teacher_delete_own_draft_student_plans"
  ON student_plans
  FOR DELETE
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND created_by = auth.uid()
    AND status = 'draft'
    AND submitted_at IS NULL
    AND finalized_at IS NULL
    AND approved_at IS NULL
  );

-- ============================================================
-- End of Migration 090
-- ============================================================

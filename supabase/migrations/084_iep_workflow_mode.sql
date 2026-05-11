-- Migration 084: Configurable IEP workflow modes
--
-- IMPORTANT — run in TWO separate SQL Editor executions:
--   Part A: just the ALTER TYPE line (must be committed before Part B)
--   Part B: everything from "── 2." onward
--
-- PostgreSQL requires ALTER TYPE ADD VALUE to be committed before the new
-- value can be referenced in the same session (RLS policies, CHECK clauses).
-- Running both parts in one paste will raise:
--   "unsafe use of new value of enum type plan_status"
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART A — run this first, alone, then click Run
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TYPE plan_status ADD VALUE IF NOT EXISTS 'finalized';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART B — after Part A succeeds, paste and run everything below
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


-- ── 2. School-level workflow mode ─────────────────────────────────────────────

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS iep_workflow_mode TEXT
    NOT NULL DEFAULT 'simple_review'
    CHECK (iep_workflow_mode IN ('simple_review', 'admin_approval_required'));


-- ── 3. Finalization audit fields on student_plans ─────────────────────────────

ALTER TABLE student_plans
  ADD COLUMN IF NOT EXISTS finalized_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by   UUID REFERENCES profiles(id) ON DELETE SET NULL;


-- ── 4. RLS – student_plans head ───────────────────────────────────────────────
-- Widen teacher UPDATE WITH CHECK to allow 'finalized' as a target status.
-- USING clause is unchanged (teachers can only update currently non-terminal plans).

DROP POLICY IF EXISTS "teacher_update_draft_student_plans" ON student_plans;

CREATE POLICY "teacher_update_draft_student_plans"
  ON student_plans
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
    AND status IN ('draft', 'submitted', 'in_review')
  )
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND status IN ('draft', 'submitted', 'in_review', 'finalized')
  );


-- ── 5. RLS – sub-row teacher_write policies ───────────────────────────────────
-- savePlan() saves sub-rows BEFORE flipping the head to 'finalized' (step 3 in
-- the TypeScript function), so sub-rows are always written against a 'draft'
-- head. 'finalized' is intentionally ABSENT from sub-row USING and WITH CHECK:
-- once the head is finalized, any direct teacher sub-row write is rejected by
-- RLS, closing the direct-API bypass hole.
-- school_admin and super_admin FOR ALL policies are unchanged.

-- student_plan_goals
DROP POLICY IF EXISTS "teacher_write_student_plan_goals" ON student_plan_goals;

CREATE POLICY "teacher_write_student_plan_goals"
  ON student_plan_goals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_goals.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_goals.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  );

-- student_plan_interventions
DROP POLICY IF EXISTS "teacher_write_student_plan_interventions" ON student_plan_interventions;

CREATE POLICY "teacher_write_student_plan_interventions"
  ON student_plan_interventions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_interventions.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_interventions.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  );

-- student_plan_progress_entries
DROP POLICY IF EXISTS "teacher_write_student_plan_progress_entries" ON student_plan_progress_entries;

CREATE POLICY "teacher_write_student_plan_progress_entries"
  ON student_plan_progress_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_progress_entries.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_progress_entries.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  );

-- student_plan_attachments
DROP POLICY IF EXISTS "teacher_write_student_plan_attachments" ON student_plan_attachments;

CREATE POLICY "teacher_write_student_plan_attachments"
  ON student_plan_attachments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_attachments.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_attachments.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft', 'submitted', 'in_review')
    )
  );

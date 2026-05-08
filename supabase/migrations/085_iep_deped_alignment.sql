-- ============================================================
-- Migration 085 – IEP DepEd alignment (additive only)
--
-- Aligns the structured IEP authoring flow with DepEd Order
-- No. 44 s. 2021 guidance without rewriting migration 070.
--
-- Strategy: JSONB payload on student_plans head for all new
-- single-value and array sections (Cover, Learner Info snapshot,
-- Difficulties/Medical, Meeting, Team Members, Present Levels,
-- Assistive Devices, Barriers/Accommodations, Prepared/Reviewed).
-- Structured child tables get only the narrow extra columns the
-- goal/intervention rows need for DepEd-style goal blocks.
--
-- NULL-safe: all new columns are nullable; existing plans and
-- all existing queries are unaffected.  No new tables, no new
-- RLS policies (new columns inherit existing table policies).
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. student_plans — DepEd-specific payload column
-- ─────────────────────────────────────────────────────────────
-- iep_details stores the following logical sections as a JSONB
-- object.  See src/features/plans/types.ts (IepDetails) for the
-- full TypeScript shape.
--
-- Sections stored:
--   cover           → region, division, district
--   learner         → lrn, birth_date, sex, grade,
--                     religion, mother_tongue, home_address,
--                     parent_workplace
--   difficulties    → diff_seeing … diff_other + medical fields
--   present_levels  → evaluation_results, academic_strengths,
--                     academic_needs, disability_impact
--   meeting         → date, last_iep_date, purpose, revision,
--                     iep_review_date, recommendations, agreements
--   team_members    → [ { id, name, role, requires_ack,
--                          acknowledged_at } ]
--   assistive_devices → [ { id, difficulty, device } ]
--   barriers        → [ { id, difficulty, learning_barriers,
--                          learning_facilitators, accommodations } ]
--   signature       → prepared_by, prepared_date,
--                     checked_reviewed_by, checked_reviewed_date
-- ─────────────────────────────────────────────────────────────
ALTER TABLE student_plans
  ADD COLUMN IF NOT EXISTS iep_details JSONB;


-- ─────────────────────────────────────────────────────────────
-- 2. student_plan_goals — DepEd annual-goal extra fields
-- ─────────────────────────────────────────────────────────────
-- enroute_objectives  — "en route" / short-term objectives
-- timeline            — overall goal timeline / session count
-- responsible_person  — individual(s) responsible for this goal
-- remarks             — instructional evaluation / remarks column
-- ─────────────────────────────────────────────────────────────
ALTER TABLE student_plan_goals
  ADD COLUMN IF NOT EXISTS enroute_objectives TEXT,
  ADD COLUMN IF NOT EXISTS timeline           TEXT,
  ADD COLUMN IF NOT EXISTS responsible_person TEXT,
  ADD COLUMN IF NOT EXISTS remarks            TEXT;


-- ─────────────────────────────────────────────────────────────
-- 3. student_plan_interventions — link to a specific goal
-- ─────────────────────────────────────────────────────────────
-- goal_id FK allows each intervention/activity to be grouped
-- under its associated annual goal in the DepEd-style print
-- view.  NULL = not linked to a specific goal (backward compat).
-- ON DELETE SET NULL: deleting a goal does not cascade-delete
-- its interventions; they become unlinked instead.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE student_plan_interventions
  ADD COLUMN IF NOT EXISTS goal_id UUID
    REFERENCES student_plan_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_plan_interventions_goal
  ON student_plan_interventions (goal_id)
  WHERE goal_id IS NOT NULL;


-- ============================================================
-- End of Migration 085
-- ============================================================

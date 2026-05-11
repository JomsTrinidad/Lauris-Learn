-- ============================================================
-- Migration 088 — IEP Revision Workflow (strictly additive)
--
-- Adds three nullable columns to student_plans to track revision
-- lineage. No new tables, no RLS changes, no triggers.
--
-- Columns:
--   parent_plan_id    — UUID of the root (first) plan in the chain.
--                       NULL for original plans; set on revision INSERT.
--   revision_number   — 1 for originals (DEFAULT backfills existing rows),
--                       2+ for revisions.
--   supersedes_plan_id — UUID of the immediately preceding plan.
--                        NULL for originals.
--
-- RLS: no changes needed.
--   • teacher INSERT policy already limits to status='draft', which is what
--     createRevision() uses. Teacher can create a revision of any plan they
--     authored while it was editable, as long as the new row is draft.
--   • school_admin FOR ALL covers admin-initiated revisions.
--   • Finalized/approved head rows remain immutable — teacher UPDATE USING
--     clause already clamps to status IN ('draft','submitted','in_review').
--
-- NULL safety: existing plans all get revision_number=1 (DEFAULT).
-- ============================================================

ALTER TABLE student_plans
  ADD COLUMN IF NOT EXISTS parent_plan_id     UUID REFERENCES student_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_number    SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_plan_id UUID REFERENCES student_plans(id) ON DELETE SET NULL;

-- Supports "show all revisions of plan X" queries.
CREATE INDEX IF NOT EXISTS idx_student_plans_parent_plan_id
  ON student_plans (parent_plan_id)
  WHERE parent_plan_id IS NOT NULL;

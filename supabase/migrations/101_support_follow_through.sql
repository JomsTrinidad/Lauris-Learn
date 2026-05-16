-- ============================================================
-- Migration 101 — Support Follow-Through / Home Guidance Items
--
-- Purpose:
--   Adds structured, parent-facing follow-through guidance items
--   associated with a support plan. Answers: "What should the parent
--   continue reinforcing at home?"
--
-- Design decisions:
--   - Separate relational table (not JSONB in iep_details) so each item
--     has its own lifecycle (archive, share toggle, future metrics).
--   - student_id + school_id are denormalized for simpler RLS without
--     a JOIN through student_plans.
--   - is_shared_with_parent = false by default. Staff explicitly chooses
--     what is visible to parents — nothing leaks automatically.
--   - shared_with_parent_at captured for timeline event ("guidance first
--     shared") without needing audit logs.
--   - archived_at (soft delete) — items are never hard-deleted; they can
--     be un-archived. Keeps the audit trail clean.
--   - No parent-write path. Parents read, staff write.
--
-- RLS isolation:
--   - school_admin: full CRUD within own school.
--   - teacher: SELECT for students they can see; INSERT/UPDATE/DELETE for
--     same set. Sub-row scoping consistent with student_plan_* tables.
--   - parent: SELECT where student is their child, item is shared, active
--     (not archived), AND the parent plan is finalized/approved.
--     Defense-in-depth: is_shared_with_parent alone is not enough — the
--     plan must also be in a parent-visible state.
--   - super_admin: bypass (matches migration 002 pattern).
--
-- Strictly additive. Does NOT modify any existing table, policy, helper,
-- RPC, trigger, or enum.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_follow_through_items (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Parent plan linkage (CASCADE so items disappear when the plan is hard-deleted)
  plan_id               UUID         NOT NULL REFERENCES student_plans(id) ON DELETE CASCADE,

  -- Denormalized for RLS — avoids a JOIN through student_plans for every policy check
  student_id            UUID         NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  school_id             UUID         NOT NULL REFERENCES schools(id)       ON DELETE CASCADE,

  -- Core content
  title                 TEXT         NOT NULL,
  description           TEXT,

  -- Suggested values (not an enum — stays flexible for future category additions
  -- without DDL churn):
  -- Communication, Behavior / Regulation, Fine Motor, Social Interaction,
  -- Learning Reinforcement, Sensory Support, Daily Living, Observation Request
  category              TEXT,

  -- Optional checkpoint date shown to parent as "check in by…"
  review_date           DATE,

  -- Parent visibility gate — explicit opt-in per item
  is_shared_with_parent BOOLEAN      NOT NULL DEFAULT false,
  -- Set once when is_shared_with_parent first flips to true (application layer).
  -- Used for the "Home guidance first shared" timeline event.
  shared_with_parent_at TIMESTAMPTZ,

  -- Ordering within a plan's guidance list
  sort_order            INT          NOT NULL DEFAULT 0,

  -- Authorship
  created_by            UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Soft delete — null = active, non-null = archived
  archived_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sfti_plan
  ON support_follow_through_items (plan_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_sfti_student
  ON support_follow_through_items (student_id, is_shared_with_parent)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sfti_school
  ON support_follow_through_items (school_id);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- Reuse the project-wide updated_at helper. The table has no updated_at
-- column (items are lightweight and append-only except for the archive/share
-- toggles) so we skip set_updated_at here.

-- DML audit (consistent with all other plan sub-row tables).
CREATE TRIGGER audit_support_follow_through_items
  AFTER INSERT OR UPDATE OR DELETE ON support_follow_through_items
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════

ALTER TABLE support_follow_through_items ENABLE ROW LEVEL SECURITY;

-- ── 3.1  school_admin — full CRUD within own school ──────────────
DROP POLICY IF EXISTS "school_admin_all_follow_through_items" ON support_follow_through_items;

CREATE POLICY "school_admin_all_follow_through_items"
  ON support_follow_through_items
  FOR ALL
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );


-- ── 3.2  teacher — SELECT for their visible students ─────────────
DROP POLICY IF EXISTS "teacher_select_follow_through_items" ON support_follow_through_items;

CREATE POLICY "teacher_select_follow_through_items"
  ON support_follow_through_items
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  );


-- ── 3.3  teacher — INSERT / UPDATE / DELETE for their students ───
DROP POLICY IF EXISTS "teacher_write_follow_through_items" ON support_follow_through_items;

CREATE POLICY "teacher_write_follow_through_items"
  ON support_follow_through_items
  FOR ALL
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  )
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  );


-- ── 3.4  parent — read-only, shared + active items, finalized plan only ──
-- Three gates (AND-chained for defense-in-depth):
--   (a) student_id is the parent's own child
--   (b) item is explicitly shared with parent AND not archived
--   (c) the associated plan is in a parent-visible status
DROP POLICY IF EXISTS "parent_select_follow_through_items" ON support_follow_through_items;

CREATE POLICY "parent_select_follow_through_items"
  ON support_follow_through_items
  FOR SELECT
  TO authenticated
  USING (
    -- (a) own child
    student_id = ANY(parent_student_ids())
    -- (b) explicitly shared and active
    AND is_shared_with_parent = true
    AND archived_at IS NULL
    -- (c) plan is in a parent-visible state
    AND EXISTS (
      SELECT 1 FROM student_plans sp
      WHERE sp.id = plan_id
        AND sp.status IN ('finalized', 'approved')
    )
  );


-- ── 3.5  super_admin — bypass (matches migration 002 pattern) ────
DROP POLICY IF EXISTS "super_admin_all_follow_through_items" ON support_follow_through_items;

CREATE POLICY "super_admin_all_follow_through_items"
  ON support_follow_through_items
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ============================================================
-- End of Migration 101
-- ============================================================

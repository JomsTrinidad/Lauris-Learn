-- ============================================================
-- Migration 102 — Parent Observations
--
-- Purpose:
--   Allows parents to submit lightweight, structured observations tied to
--   specific home support guidance items. Answers: "What are parents
--   noticing at home related to support guidance?"
--
-- This is bidirectional support continuity — NOT a messaging system.
-- Observations are:
--   - anchored to a specific support_follow_through_items row
--   - append-only from the parent side (no parent edit/delete)
--   - visible to the school's support team
--   - kept lightweight and structured (text + optional kind + optional date)
--
-- Design decisions:
--   - follow_through_item_id anchors every observation to a specific
--     guidance item. Parents cannot submit free-floating messages.
--   - plan_id, student_id, school_id are denormalized for efficient RLS
--     and timeline queries without JOIN chains through related tables.
--   - guardian_id (not auth.uid()) for parent identity — matches the
--     existing parent_guardian_ids() helper and the guardians table model.
--     parent_student_ids() resolves via JWT email → guardians.email.
--   - observation_kind TEXT (not enum): same pattern as category in 101.
--     Suggested values: improvement_noticed | still_challenging |
--     needs_follow_up | neutral_update.
--   - observed_at DATE: optional "when the parent noticed this" date.
--     NULL means the observation is tied to the submission date (created_at).
--   - archived_at TIMESTAMPTZ: soft delete. Parents cannot edit; the only
--     lifecycle action is retraction (staff-initiated archive for moderation,
--     or future parent self-retract if added later).
--   - No parent UPDATE policy — observations are append-only. No partial
--     edits possible once submitted.
--
-- RLS isolation:
--   - school_admin: full visibility (SELECT all) + moderation (UPDATE to
--     archive). Separate policies to avoid giving INSERT to staff.
--   - teacher: SELECT for their visible students only.
--   - parent: SELECT own observations (guardian binding + own child).
--   - parent: INSERT — three AND-chained gates for defense-in-depth:
--       (a) student_id = own child (parent_student_ids())
--       (b) guardian_id + student_id binding verified via EXISTS(guardians)
--           with JWT email match — prevents cross-child guardian spoofing
--       (c) follow_through_item_id references an item that is_shared=true
--           and not archived — parents cannot observe hidden guidance
--   - super_admin: bypass (matches migration 002 pattern).
--
-- Strictly additive. Does NOT modify any existing table, policy, helper,
-- RPC, trigger, or enum.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS parent_observations (
  id                       UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Anchor — every observation is tied to a specific guidance item
  follow_through_item_id   UUID         NOT NULL REFERENCES support_follow_through_items(id) ON DELETE CASCADE,

  -- Denormalized for RLS and timeline queries
  plan_id                  UUID         NOT NULL REFERENCES student_plans(id)  ON DELETE CASCADE,
  student_id               UUID         NOT NULL REFERENCES students(id)        ON DELETE CASCADE,
  school_id                UUID         NOT NULL REFERENCES schools(id)         ON DELETE CASCADE,

  -- Parent identity — guardian_id matches parent_guardian_ids() pattern
  guardian_id              UUID         REFERENCES guardians(id)               ON DELETE SET NULL,

  -- Core content
  -- Soft 300-char guideline enforced at app layer; no DB CHECK so parents
  -- don't hit a hard truncation error from older app versions.
  observation_text         TEXT         NOT NULL,

  -- Optional structured kind for lightweight classification.
  -- Not an enum — consistent with category in support_follow_through_items.
  -- Suggested values: improvement_noticed | still_challenging |
  --                   needs_follow_up | neutral_update
  observation_kind         TEXT,

  -- When the parent noticed this (optional). NULL → use created_at as proxy.
  observed_at              DATE,

  -- Metadata
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Soft delete — NULL = active, non-null = archived/retracted
  archived_at              TIMESTAMPTZ
);

-- Index: primary query path for the staff management panel (load all
-- observations for a plan in one batch, then group by item)
CREATE INDEX IF NOT EXISTS idx_po_plan
  ON parent_observations (plan_id, created_at)
  WHERE archived_at IS NULL;

-- Index: per-item query (parent portal loads per-item)
CREATE INDEX IF NOT EXISTS idx_po_item
  ON parent_observations (follow_through_item_id, created_at)
  WHERE archived_at IS NULL;

-- Index: student-scoped queries
CREATE INDEX IF NOT EXISTS idx_po_student
  ON parent_observations (student_id)
  WHERE archived_at IS NULL;

-- Index: school-scoped queries
CREATE INDEX IF NOT EXISTS idx_po_school
  ON parent_observations (school_id);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- DML audit (consistent with all other plan-adjacent tables).
CREATE TRIGGER audit_parent_observations
  AFTER INSERT OR UPDATE OR DELETE ON parent_observations
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════

ALTER TABLE parent_observations ENABLE ROW LEVEL SECURITY;


-- ── 3.1  school_admin — full visibility within own school ─────────────────
-- SELECT + UPDATE for moderation (archive inappropriate observations).
-- No INSERT — school admins do not post on behalf of parents.
-- Separate SELECT and UPDATE policies for clarity.

DROP POLICY IF EXISTS "school_admin_select_parent_observations" ON parent_observations;

CREATE POLICY "school_admin_select_parent_observations"
  ON parent_observations
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

DROP POLICY IF EXISTS "school_admin_update_parent_observations" ON parent_observations;

CREATE POLICY "school_admin_update_parent_observations"
  ON parent_observations
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );


-- ── 3.2  teacher — SELECT for their visible students ─────────────────────

DROP POLICY IF EXISTS "teacher_select_parent_observations" ON parent_observations;

CREATE POLICY "teacher_select_parent_observations"
  ON parent_observations
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  );


-- ── 3.3  parent — SELECT own observations only ────────────────────────────
-- Parents see only their own observations (own guardian_id + own child).
-- Multiple guardians for the same child do NOT see each other's observations.

DROP POLICY IF EXISTS "parent_select_own_observations" ON parent_observations;

CREATE POLICY "parent_select_own_observations"
  ON parent_observations
  FOR SELECT
  TO authenticated
  USING (
    student_id = ANY(parent_student_ids())
    AND guardian_id = ANY(parent_guardian_ids())
    AND archived_at IS NULL
  );


-- ── 3.4  parent — INSERT with three-gate defense-in-depth ─────────────────
--
-- Gate (a): student_id is the caller's own child (fast index path)
-- Gate (b): guardian_id is correctly bound to this student AND to the
--           caller's JWT email (prevents cross-child guardian spoofing)
-- Gate (c): the referenced guidance item is shared with parents and active
--           (parents cannot observe hidden or archived guidance)

DROP POLICY IF EXISTS "parent_insert_own_observations" ON parent_observations;

CREATE POLICY "parent_insert_own_observations"
  ON parent_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- (a) own child
    student_id = ANY(parent_student_ids())
    -- (b) guardian_id ownership + student binding
    AND EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.id = guardian_id
        AND g.student_id = student_id
        AND lower(g.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    -- (c) guidance item must be shared with parents and not archived
    AND EXISTS (
      SELECT 1 FROM support_follow_through_items sfti
      WHERE sfti.id = follow_through_item_id
        AND sfti.is_shared_with_parent = true
        AND sfti.archived_at IS NULL
    )
  );


-- ── 3.5  super_admin — bypass (matches migration 002 pattern) ────────────

DROP POLICY IF EXISTS "super_admin_all_parent_observations" ON parent_observations;

CREATE POLICY "super_admin_all_parent_observations"
  ON parent_observations
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ============================================================
-- End of Migration 102
-- ============================================================

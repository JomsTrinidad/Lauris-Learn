-- ============================================================
-- Migration 070 – Plans & Forms (structured internal plans)
--
-- Purpose:
--   Adds a structured "plans" object distinct from the existing
--   uploaded-document system. The first usable plan_type is 'iep'
--   (internal IEP Plan); the schema is shaped so 'support', 'behavior',
--   and 'other' can be added later without DDL churn.
--
-- DELIBERATELY OUT OF SCOPE here:
--   - No changes to child_documents / child_document_versions / RLS for
--     uploaded files. Uploaded IEP PDFs continue to live there.
--   - No template builder. Each plan stores its own goals, interventions,
--     etc. as concrete sub-rows (no template-config table).
--   - No parent-portal access in v1. Parent visibility is deferred until
--     a clean parent-share pattern is in place.
--   - No SECURITY DEFINER RPCs.
--   - No storage bucket — attachments REFERENCE existing child_documents
--     rows; the file lives in the existing child-documents bucket.
--
-- Reused project-wide helpers:
--   set_updated_at()              — maintains updated_at
--   audit_log_trigger()           — DML audit into audit_logs
--   current_user_role()           — migration 031
--   current_user_school_id()      — migration 031
--   teacher_visible_student_ids() — migration 056 (patched 066)
--   is_super_admin()              — migration 002
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM (
    'iep',
    'support',
    'behavior',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE plan_status AS ENUM (
    'draft',
    'submitted',
    'in_review',
    'approved',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 2. TABLES
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 2.1 student_plans (head)
-- One row per structured plan. Holds the single-value sections
-- (Student Profile, Parent Input, Review & Approval). Multi-row
-- sections live in dedicated child tables below.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_plans (
  id                                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                         UUID         NOT NULL REFERENCES schools(id)      ON DELETE CASCADE,
  student_id                        UUID         NOT NULL REFERENCES students(id)     ON DELETE CASCADE,
  school_year_id                    UUID         REFERENCES school_years(id)          ON DELETE SET NULL,
  plan_type                         plan_type    NOT NULL DEFAULT 'iep',
  title                             TEXT         NOT NULL,
  status                            plan_status  NOT NULL DEFAULT 'draft',

  -- Student Profile
  diagnosis                         TEXT,
  strengths                         TEXT,
  areas_of_need                     TEXT,
  background_notes                  TEXT,

  -- Parent / Guardian Input (entered by staff for now; parent portal deferred)
  parent_notes                      TEXT,
  parent_concerns                   TEXT,
  home_support_notes                TEXT,

  -- Review & Approval
  review_date                       DATE,
  reviewed_by_teacher_id            UUID         REFERENCES profiles(id)              ON DELETE SET NULL,
  reviewed_by_admin_id              UUID         REFERENCES profiles(id)              ON DELETE SET NULL,
  parent_acknowledged_at            TIMESTAMPTZ,
  parent_acknowledged_by_guardian_id UUID        REFERENCES guardians(id)             ON DELETE SET NULL,
  approved_at                       TIMESTAMPTZ,
  approved_by                       UUID         REFERENCES profiles(id)              ON DELETE SET NULL,
  archived_at                       TIMESTAMPTZ,
  archive_reason                    TEXT,

  -- Bookkeeping
  created_by                        UUID         REFERENCES profiles(id)              ON DELETE SET NULL,
  created_at                        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_plans_school_student
  ON student_plans (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_plans_school_status_updated
  ON student_plans (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_plans_plan_type
  ON student_plans (school_id, plan_type);


-- ─────────────────────────────────────────────────────────────────
-- 2.2 student_plan_goals
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_plan_goals (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id             UUID         NOT NULL REFERENCES student_plans(id) ON DELETE CASCADE,
  domain              TEXT,
  description         TEXT         NOT NULL,
  target_date         DATE,
  measurement_method  TEXT,
  baseline            TEXT,
  success_criteria    TEXT,
  sort_order          INT          NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_plan_goals_plan
  ON student_plan_goals (plan_id, sort_order);


-- ─────────────────────────────────────────────────────────────────
-- 2.3 student_plan_interventions
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_plan_interventions (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id             UUID         NOT NULL REFERENCES student_plans(id) ON DELETE CASCADE,
  strategy            TEXT         NOT NULL,
  frequency           TEXT,
  responsible_person  TEXT,
  environment         TEXT,
  notes               TEXT,
  sort_order          INT          NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_plan_interventions_plan
  ON student_plan_interventions (plan_id, sort_order);


-- ─────────────────────────────────────────────────────────────────
-- 2.4 student_plan_progress_entries
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_plan_progress_entries (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         UUID         NOT NULL REFERENCES student_plans(id)       ON DELETE CASCADE,
  linked_goal_id  UUID         REFERENCES student_plan_goals(id)           ON DELETE SET NULL,
  entry_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
  progress_note   TEXT         NOT NULL,
  observed_by     TEXT,
  next_step       TEXT,
  created_by      UUID         REFERENCES profiles(id)                     ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_plan_progress_entries_plan_date
  ON student_plan_progress_entries (plan_id, entry_date DESC);


-- ─────────────────────────────────────────────────────────────────
-- 2.5 student_plan_attachments
-- A plan attachment is a reference to an existing child_documents row.
-- The actual file metadata + RLS already live there. We only store the
-- linkage. UNIQUE(plan_id, document_id) keeps a doc from being attached
-- twice to the same plan.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_plan_attachments (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id       UUID         NOT NULL REFERENCES student_plans(id)   ON DELETE CASCADE,
  document_id   UUID         NOT NULL REFERENCES child_documents(id) ON DELETE CASCADE,
  attached_by   UUID         REFERENCES profiles(id)                 ON DELETE SET NULL,
  attached_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_student_plan_attachments_plan
  ON student_plan_attachments (plan_id);
CREATE INDEX IF NOT EXISTS idx_student_plan_attachments_document
  ON student_plan_attachments (document_id);


-- ════════════════════════════════════════════════════════════════
-- 3. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- updated_at on the head only (sub-rows are append/replace by save flow).
CREATE TRIGGER set_student_plans_updated_at
  BEFORE UPDATE ON student_plans
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- DML audit (matches the document tables' pattern).
CREATE TRIGGER audit_student_plans
  AFTER INSERT OR UPDATE OR DELETE ON student_plans
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_student_plan_goals
  AFTER INSERT OR UPDATE OR DELETE ON student_plan_goals
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_student_plan_interventions
  AFTER INSERT OR UPDATE OR DELETE ON student_plan_interventions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_student_plan_progress_entries
  AFTER INSERT OR UPDATE OR DELETE ON student_plan_progress_entries
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_student_plan_attachments
  AFTER INSERT OR UPDATE OR DELETE ON student_plan_attachments
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 4. RLS
-- ════════════════════════════════════════════════════════════════

ALTER TABLE student_plans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_plan_goals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_plan_interventions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_plan_progress_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_plan_attachments       ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────
-- 4.1 student_plans
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "school_admin_all_student_plans"        ON student_plans;
DROP POLICY IF EXISTS "teacher_select_student_plans"          ON student_plans;
DROP POLICY IF EXISTS "teacher_insert_draft_student_plans"    ON student_plans;
DROP POLICY IF EXISTS "teacher_update_draft_student_plans"    ON student_plans;
DROP POLICY IF EXISTS "super_admin_all_student_plans"         ON student_plans;

-- school_admin: full read/write within own school
CREATE POLICY "school_admin_all_student_plans"
  ON student_plans
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

-- teacher: SELECT plans for any student they teach (via class enrollment).
CREATE POLICY "teacher_select_student_plans"
  ON student_plans
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  );

-- teacher: INSERT only draft/submitted plans for students they teach.
CREATE POLICY "teacher_insert_draft_student_plans"
  ON student_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
    AND status IN ('draft','submitted')
  );

-- teacher: UPDATE plans for their students, but only while status is
-- in ('draft','submitted','in_review'). They can move draft↔submitted but
-- cannot approve or archive (admin-only).
CREATE POLICY "teacher_update_draft_student_plans"
  ON student_plans
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
    AND status IN ('draft','submitted','in_review')
  )
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND status IN ('draft','submitted','in_review')
  );

-- super_admin: bypass — matches the project-wide pattern in migration 002.
CREATE POLICY "super_admin_all_student_plans"
  ON student_plans
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ─────────────────────────────────────────────────────────────────
-- 4.2 Sub-row policies — written generically: a caller can read/write
-- a sub-row iff they can read/write the parent plan. We piggyback on
-- the head's RLS via EXISTS (… SELECT 1 FROM student_plans …).
--
-- For teacher writes we additionally pin the parent's status to the
-- same in/out window as on the head.
-- ─────────────────────────────────────────────────────────────────

-- Helper macro — repeated for each child table. SQL doesn't have macros,
-- so each block is explicit.

-- ── student_plan_goals ────────────────────────────────────────────
DROP POLICY IF EXISTS "school_admin_all_student_plan_goals"     ON student_plan_goals;
DROP POLICY IF EXISTS "teacher_select_student_plan_goals"       ON student_plan_goals;
DROP POLICY IF EXISTS "teacher_write_student_plan_goals"        ON student_plan_goals;
DROP POLICY IF EXISTS "super_admin_all_student_plan_goals"      ON student_plan_goals;

CREATE POLICY "school_admin_all_student_plan_goals"
  ON student_plan_goals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_goals.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_goals.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  );

CREATE POLICY "teacher_select_student_plan_goals"
  ON student_plan_goals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_goals.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
    )
  );

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
        AND p.status IN ('draft','submitted','in_review')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_goals.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft','submitted','in_review')
    )
  );

CREATE POLICY "super_admin_all_student_plan_goals"
  ON student_plan_goals
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ── student_plan_interventions ────────────────────────────────────
DROP POLICY IF EXISTS "school_admin_all_student_plan_interventions"   ON student_plan_interventions;
DROP POLICY IF EXISTS "teacher_select_student_plan_interventions"     ON student_plan_interventions;
DROP POLICY IF EXISTS "teacher_write_student_plan_interventions"      ON student_plan_interventions;
DROP POLICY IF EXISTS "super_admin_all_student_plan_interventions"    ON student_plan_interventions;

CREATE POLICY "school_admin_all_student_plan_interventions"
  ON student_plan_interventions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_interventions.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_interventions.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  );

CREATE POLICY "teacher_select_student_plan_interventions"
  ON student_plan_interventions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_interventions.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
    )
  );

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
        AND p.status IN ('draft','submitted','in_review')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_interventions.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft','submitted','in_review')
    )
  );

CREATE POLICY "super_admin_all_student_plan_interventions"
  ON student_plan_interventions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ── student_plan_progress_entries ─────────────────────────────────
DROP POLICY IF EXISTS "school_admin_all_student_plan_progress_entries"  ON student_plan_progress_entries;
DROP POLICY IF EXISTS "teacher_select_student_plan_progress_entries"    ON student_plan_progress_entries;
DROP POLICY IF EXISTS "teacher_write_student_plan_progress_entries"     ON student_plan_progress_entries;
DROP POLICY IF EXISTS "super_admin_all_student_plan_progress_entries"   ON student_plan_progress_entries;

CREATE POLICY "school_admin_all_student_plan_progress_entries"
  ON student_plan_progress_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_progress_entries.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_progress_entries.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  );

CREATE POLICY "teacher_select_student_plan_progress_entries"
  ON student_plan_progress_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_progress_entries.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
    )
  );

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
        AND p.status IN ('draft','submitted','in_review','approved')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_progress_entries.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft','submitted','in_review','approved')
    )
  );

CREATE POLICY "super_admin_all_student_plan_progress_entries"
  ON student_plan_progress_entries
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ── student_plan_attachments ──────────────────────────────────────
DROP POLICY IF EXISTS "school_admin_all_student_plan_attachments"   ON student_plan_attachments;
DROP POLICY IF EXISTS "teacher_select_student_plan_attachments"     ON student_plan_attachments;
DROP POLICY IF EXISTS "teacher_write_student_plan_attachments"      ON student_plan_attachments;
DROP POLICY IF EXISTS "super_admin_all_student_plan_attachments"    ON student_plan_attachments;

CREATE POLICY "school_admin_all_student_plan_attachments"
  ON student_plan_attachments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_attachments.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_attachments.plan_id
        AND current_user_role() = 'school_admin'
        AND p.school_id = current_user_school_id()
    )
  );

CREATE POLICY "teacher_select_student_plan_attachments"
  ON student_plan_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_attachments.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
    )
  );

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
        AND p.status IN ('draft','submitted','in_review')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_plans p
      WHERE p.id = student_plan_attachments.plan_id
        AND current_user_role() = 'teacher'
        AND p.school_id = current_user_school_id()
        AND p.student_id = ANY(teacher_visible_student_ids())
        AND p.status IN ('draft','submitted','in_review')
    )
  );

CREATE POLICY "super_admin_all_student_plan_attachments"
  ON student_plan_attachments
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ============================================================
-- End of Migration 070
-- ============================================================

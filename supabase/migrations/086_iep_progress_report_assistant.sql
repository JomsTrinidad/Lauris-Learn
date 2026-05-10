-- ============================================================
-- Migration 086 – IEP Progress Report Assistant (additive only)
--
-- Purpose:
--   Adds extraction, summarization, and suggestion infrastructure
--   for drafting IEP content from uploaded progress reports.
--   Three new tables with RLS following migration 070 patterns.
--
-- Key design:
--   - All text extraction + AI summary is optional (provider checking)
--   - Suggestions are never auto-applied; human review required
--   - Each suggestion tracks: target section/field, source, confidence, status
--   - Audit trail: reviewed_by, reviewed_at, applied_text (if edited)
--   - RLS mirrors student_plans: school_admin/teacher scoped, super_admin bypass
--
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. iep_report_extractions
-- ════════════════════════════════════════════════════════════════
-- Tracks extraction of text from a child_document (PDF, image, Word, etc).
-- status flow: pending → extracting → done / failed / not_configured
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iep_report_extractions (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID         NOT NULL REFERENCES schools(id)              ON DELETE CASCADE,
  plan_id           UUID         NOT NULL REFERENCES student_plans(id)        ON DELETE CASCADE,
  student_id        UUID         NOT NULL REFERENCES students(id)             ON DELETE CASCADE,
  document_id       UUID         NOT NULL REFERENCES child_documents(id)      ON DELETE CASCADE,

  status            TEXT         NOT NULL DEFAULT 'pending', -- pending|extracting|done|failed|not_configured
  extracted_text    TEXT,
  extraction_error  TEXT,
  provider          TEXT,        -- 'none' (default) | 'azure_form_recognizer' | etc

  -- Extraction metadata: method, page counts, character counts, skip reason
  extraction_metadata JSONB,      -- {extraction_method, page_count, processed_page_count, extracted_character_count, ai_character_count, skipped_reason}

  created_by        UUID         REFERENCES profiles(id)                      ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iep_extractions_plan
  ON iep_report_extractions (plan_id);
CREATE INDEX IF NOT EXISTS idx_iep_extractions_school_student
  ON iep_report_extractions (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_iep_extractions_document
  ON iep_report_extractions (document_id);


-- ════════════════════════════════════════════════════════════════
-- 2. iep_report_summaries
-- ════════════════════════════════════════════════════════════════
-- Stores AI summary of extracted text into 7 structured sections.
-- status flow: pending → generating → done / failed / not_configured
-- Linked to extraction; one extraction can feed multiple summaries
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iep_report_summaries (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  extraction_id         UUID         NOT NULL REFERENCES iep_report_extractions(id) ON DELETE CASCADE,
  plan_id               UUID         NOT NULL REFERENCES student_plans(id)         ON DELETE CASCADE,
  school_id             UUID         NOT NULL REFERENCES schools(id)               ON DELETE CASCADE,

  status                TEXT         NOT NULL DEFAULT 'pending', -- pending|generating|done|failed|not_configured

  -- Seven summary sections
  therapy_focus         TEXT,
  strengths             TEXT,
  areas_of_need         TEXT,
  progress_since_last   TEXT,
  recommended_supports  TEXT,
  suggested_goals       TEXT,
  followup_notes        TEXT,

  summary_error         TEXT,
  provider              TEXT,        -- 'none' (default) | 'anthropic_api' | etc

  created_by            UUID         REFERENCES profiles(id)                   ON DELETE SET NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iep_summaries_extraction
  ON iep_report_summaries (extraction_id);
CREATE INDEX IF NOT EXISTS idx_iep_summaries_plan
  ON iep_report_summaries (plan_id);
CREATE INDEX IF NOT EXISTS idx_iep_summaries_school_student
  ON iep_report_summaries (school_id);


-- ════════════════════════════════════════════════════════════════
-- 3. iep_ai_suggestions
-- ════════════════════════════════════════════════════════════════
-- Stores AI-mapped suggestions from a summary into specific IEP fields.
-- One suggestion = one target field + suggested text.
-- Audit trail: reviewed_by, reviewed_at, applied_text (if edited before applying).
-- status: pending (awaiting review) → applied / rejected / edited
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iep_ai_suggestions (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  summary_id           UUID         NOT NULL REFERENCES iep_report_summaries(id)   ON DELETE CASCADE,
  plan_id              UUID         NOT NULL REFERENCES student_plans(id)          ON DELETE CASCADE,
  school_id            UUID         NOT NULL REFERENCES schools(id)                ON DELETE CASCADE,
  source_document_id   UUID         NOT NULL REFERENCES child_documents(id)        ON DELETE CASCADE,

  -- Target IEP section and field
  target_section       TEXT         NOT NULL, -- 'assessment'|'supports'|'goals'
  target_field         TEXT         NOT NULL, -- 'evaluation_results'|'present_academic_strengths'|etc

  -- Suggestion content
  suggested_text       TEXT         NOT NULL,
  source_excerpt       TEXT,        -- quote from extracted text or summary
  confidence_label     TEXT         NOT NULL DEFAULT 'medium', -- 'high'|'medium'|'low'

  -- Audit trail
  status               TEXT         NOT NULL DEFAULT 'pending', -- pending|applied|rejected|edited
  applied_text         TEXT,        -- stores edited text if user changed it before applying
  reviewed_by          UUID         REFERENCES profiles(id)                   ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iep_suggestions_summary
  ON iep_ai_suggestions (summary_id);
CREATE INDEX IF NOT EXISTS idx_iep_suggestions_plan
  ON iep_ai_suggestions (plan_id);
CREATE INDEX IF NOT EXISTS idx_iep_suggestions_school_student
  ON iep_ai_suggestions (school_id);
CREATE INDEX IF NOT EXISTS idx_iep_suggestions_status
  ON iep_ai_suggestions (plan_id, status);


-- ════════════════════════════════════════════════════════════════
-- 4. TRIGGERS
-- ════════════════════════════════════════════════════════════════

CREATE TRIGGER set_iep_extractions_updated_at
  BEFORE UPDATE ON iep_report_extractions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_iep_summaries_updated_at
  BEFORE UPDATE ON iep_report_summaries
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_iep_suggestions_updated_at
  BEFORE UPDATE ON iep_ai_suggestions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ════════════════════════════════════════════════════════════════
-- 5. RLS POLICIES
-- ════════════════════════════════════════════════════════════════
-- All three tables use the student_plans pattern:
--   school_admin → full access within school
--   teacher → SELECT/UPDATE on plans for students they teach
--   super_admin → bypass

ALTER TABLE iep_report_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE iep_report_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE iep_ai_suggestions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- iep_report_extractions policies
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_admin_extractions_all"
  ON iep_report_extractions
  FOR ALL
  USING (
    (current_user_role() = 'school_admin'
    AND school_id = current_user_school_id())
    OR is_super_admin()
  );

CREATE POLICY "teacher_extractions_own_students"
  ON iep_report_extractions
  FOR SELECT
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  );

CREATE POLICY "teacher_extractions_update_own"
  ON iep_report_extractions
  FOR UPDATE
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  );

-- ─────────────────────────────────────────────────────────────────
-- iep_report_summaries policies
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_admin_summaries_all"
  ON iep_report_summaries
  FOR ALL
  USING (
    (current_user_role() = 'school_admin'
    AND school_id = current_user_school_id())
    OR is_super_admin()
  );

CREATE POLICY "teacher_summaries_own_students"
  ON iep_report_summaries
  FOR SELECT
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM student_plans sp
      WHERE sp.id = plan_id
      AND sp.student_id = ANY(teacher_visible_student_ids())
    )
  );

CREATE POLICY "teacher_summaries_update_own"
  ON iep_report_summaries
  FOR UPDATE
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM student_plans sp
      WHERE sp.id = plan_id
      AND sp.student_id = ANY(teacher_visible_student_ids())
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- iep_ai_suggestions policies
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_admin_suggestions_all"
  ON iep_ai_suggestions
  FOR ALL
  USING (
    (current_user_role() = 'school_admin'
    AND school_id = current_user_school_id())
    OR is_super_admin()
  );

CREATE POLICY "teacher_suggestions_own_students"
  ON iep_ai_suggestions
  FOR SELECT
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM student_plans sp
      WHERE sp.id = plan_id
      AND sp.student_id = ANY(teacher_visible_student_ids())
    )
  );

CREATE POLICY "teacher_suggestions_update_own"
  ON iep_ai_suggestions
  FOR UPDATE
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM student_plans sp
      WHERE sp.id = plan_id
      AND sp.student_id = ANY(teacher_visible_student_ids())
    )
  );

-- ════════════════════════════════════════════════════════════════
-- End of Migration 086
-- ════════════════════════════════════════════════════════════════

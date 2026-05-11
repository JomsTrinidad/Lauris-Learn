-- ============================================================
-- Migration 089 – Evidence Assistant metadata columns (additive)
--
-- Adds 7 flat metadata columns to iep_report_extractions.
-- The existing extraction_metadata JSONB column is preserved for
-- backward-compat; new code writes the flat columns instead.
--
-- New columns:
--   extraction_method          — how text was obtained
--   page_count                 — total pages in source PDF
--   processed_page_count       — pages actually processed (≤ page_count)
--   image_count                — number of images processed via OCR
--   extracted_character_count  — raw char count before AI truncation
--   ai_character_count         — chars actually sent to AI
--   skipped_reason             — why extraction was skipped (if applicable)
-- ============================================================

ALTER TABLE iep_report_extractions
  ADD COLUMN IF NOT EXISTS extraction_method          TEXT,
  ADD COLUMN IF NOT EXISTS page_count                 INT,
  ADD COLUMN IF NOT EXISTS processed_page_count       INT,
  ADD COLUMN IF NOT EXISTS image_count                INT,
  ADD COLUMN IF NOT EXISTS extracted_character_count  INT,
  ADD COLUMN IF NOT EXISTS ai_character_count         INT,
  ADD COLUMN IF NOT EXISTS skipped_reason             TEXT;

-- ============================================================
-- Teacher INSERT policies (additive fix for migration 086 gap)
--
-- Migration 086 added SELECT + UPDATE policies for teachers but no INSERT.
-- Teachers can see the Evidence Assistant UI (isStaff=true) and must be
-- able to create extraction/summary/suggestion records for their students.
-- ============================================================

CREATE POLICY "teacher_extractions_insert_own"
  ON iep_report_extractions
  FOR INSERT
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND student_id = ANY(teacher_visible_student_ids())
  );

CREATE POLICY "teacher_summaries_insert_own"
  ON iep_report_summaries
  FOR INSERT
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM student_plans sp
      WHERE sp.id = plan_id
        AND sp.student_id = ANY(teacher_visible_student_ids())
    )
  );

CREATE POLICY "teacher_suggestions_insert_own"
  ON iep_ai_suggestions
  FOR INSERT
  WITH CHECK (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM student_plans sp
      WHERE sp.id = plan_id
        AND sp.student_id = ANY(teacher_visible_student_ids())
    )
  );

-- ============================================================
-- End of Migration 089
-- ============================================================

-- ============================================================
-- Migration 090 – Suggestion provenance columns (additive)
--
-- Adds two denormalized columns to iep_ai_suggestions so the UI
-- can show source traceability without 3-table joins:
--
--   source_document_title  — title of the child_document that was
--                            extracted (or the uploaded file name for
--                            direct uploads). Populated at insert time
--                            by the /api/iep-assistant/summarize route.
--                            NULL for rows created before this migration.
--
--   extraction_method      — how the text was obtained
--                            ('pdf_native_text' | 'image_ocr' |
--                             'pdf_scanned' | 'uploaded_file' | 'skipped').
--                            Denormalized from iep_report_extractions at
--                            insert time. NULL for pre-migration rows.
--
-- No RLS changes needed — the existing policies already cover these
-- columns (they are part of the iep_ai_suggestions row shape).
-- ============================================================

ALTER TABLE iep_ai_suggestions
  ADD COLUMN IF NOT EXISTS source_document_title  TEXT,
  ADD COLUMN IF NOT EXISTS extraction_method      TEXT;

-- ============================================================
-- End of Migration 090
-- ============================================================

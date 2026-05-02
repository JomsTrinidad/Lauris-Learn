-- ============================================================
-- Seed: ONE test child_document with v1 metadata + uploaded_files row.
--
-- Use to smoke-test the Phase D documents UI in the browser.
-- Idempotent — safe to re-run; it deletes any prior copy first.
--
-- IMPORTANT: this only seeds DATABASE METADATA. No actual file is uploaded
-- to the child-documents storage bucket. Consequences:
--   - The document appears in the workspace, opens in the detail modal.
--   - Clicking View/Download successfully calls log_document_access(),
--     mints a signed URL, and writes a row to document_access_events.
--   - Following the signed URL will return 404 from storage (no object).
--     That's fine — the goal is to verify the UI → API → RPC → audit path.
--
-- Picks the first existing school + student + school_admin profile.
-- Document id is hardcoded so re-runs replace the same row cleanly.
-- ============================================================

DO $$
DECLARE
  v_school_id     UUID;
  v_student_id    UUID;
  v_admin_id      UUID;
  v_doc_id        UUID := '11111111-2222-3333-4444-555555555555'::UUID;
  v_version_id    UUID;
  v_uploaded_id   UUID;
  v_storage_path  TEXT;
BEGIN
  ----------------------------------------------------------------
  -- Resolve fixtures
  ----------------------------------------------------------------
  SELECT id INTO v_school_id
    FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'No school rows found. Apply schema + seeds first.';
  END IF;

  SELECT id INTO v_student_id
    FROM students WHERE school_id = v_school_id ORDER BY created_at LIMIT 1;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'No students in school %', v_school_id;
  END IF;

  SELECT id INTO v_admin_id
    FROM profiles
    WHERE school_id = v_school_id AND role = 'school_admin'
    LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No school_admin profile in school %', v_school_id;
  END IF;

  v_storage_path :=
    v_school_id::text  || '/' ||
    v_student_id::text || '/' ||
    v_doc_id::text     || '/v1.pdf';

  ----------------------------------------------------------------
  -- Idempotent cleanup of any prior seed (FK + CHECK aware order):
  --   1. NULL out the head's pointer + revert to 'draft' so deleting
  --      versions doesn't violate the
  --      "non-draft must have current_version_id" CHECK.
  --   2. Delete uploaded_files rows that point at the doomed versions.
  --   3. Delete versions (head FK is RESTRICT against children, so this
  --      must happen before head delete).
  --   4. Delete the head.
  ----------------------------------------------------------------
  UPDATE child_documents
    SET current_version_id = NULL, status = 'draft'
    WHERE id = v_doc_id;

  DELETE FROM uploaded_files
    WHERE related_entity_type = 'child_document_version'
      AND related_entity_id IN (
        SELECT id FROM child_document_versions WHERE document_id = v_doc_id
      );

  DELETE FROM child_document_versions WHERE document_id = v_doc_id;
  DELETE FROM child_documents          WHERE id          = v_doc_id;

  ----------------------------------------------------------------
  -- 1. Create the document head as 'draft' with no version yet.
  ----------------------------------------------------------------
  INSERT INTO child_documents (
    id, school_id, student_id, document_type, title, description, status,
    effective_date, review_date, source_kind, created_by
  ) VALUES (
    v_doc_id,
    v_school_id, v_student_id,
    'iep',
    'TEST IEP — Phase D smoke',
    'Seed document for testing the documents workspace UI. The storage object does not exist — opening the signed URL will 404 from storage, but the audit event in document_access_events still lands.',
    'draft',
    CURRENT_DATE,
    (CURRENT_DATE + INTERVAL '180 days')::DATE,
    'school',
    v_admin_id
  );

  ----------------------------------------------------------------
  -- 2. Add version 1.
  ----------------------------------------------------------------
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name,
    file_size, mime_type, uploaded_by_user_id, uploaded_by_kind, upload_note
  ) VALUES (
    v_doc_id, v_school_id, 1,
    v_storage_path,
    'test-iep.pdf',
    524288,                  -- 0.5 MB (informational only)
    'application/pdf',
    v_admin_id, 'school_admin',
    'Seeded by supabase/tests/seed_one_document.sql — no real blob in storage.'
  ) RETURNING id INTO v_version_id;

  ----------------------------------------------------------------
  -- 3. Create the matching uploaded_files lifecycle row.
  ----------------------------------------------------------------
  INSERT INTO uploaded_files (
    school_id, uploaded_by, related_entity_type, related_entity_id,
    bucket, storage_path, file_size, mime_type, status
  ) VALUES (
    v_school_id, v_admin_id,
    'child_document_version', v_version_id,
    'child-documents', v_storage_path,
    524288, 'application/pdf', 'active'
  ) RETURNING id INTO v_uploaded_id;

  ----------------------------------------------------------------
  -- 4. Link the version to its uploaded_files row.
  ----------------------------------------------------------------
  UPDATE child_document_versions
    SET uploaded_file_id = v_uploaded_id
    WHERE id = v_version_id;

  ----------------------------------------------------------------
  -- 5. Repoint head to v1 and promote to 'active'.
  --    Trigger 5.D verifies v1 exists, belongs to this doc, not hidden.
  ----------------------------------------------------------------
  UPDATE child_documents
    SET current_version_id = v_version_id,
        status             = 'active'
    WHERE id = v_doc_id;

  ----------------------------------------------------------------
  -- Report
  ----------------------------------------------------------------
  RAISE NOTICE 'Seed complete:';
  RAISE NOTICE '  document_id  = %', v_doc_id;
  RAISE NOTICE '  version_id   = %', v_version_id;
  RAISE NOTICE '  uploaded_id  = %', v_uploaded_id;
  RAISE NOTICE '  school_id    = %', v_school_id;
  RAISE NOTICE '  student_id   = %', v_student_id;
  RAISE NOTICE '  storage_path = %', v_storage_path;
END $$;

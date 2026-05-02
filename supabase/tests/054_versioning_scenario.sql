-- ============================================================
-- Test scenario for migration 054 — versioning + hide behavior
--
-- This is NOT a migration. Run manually in the Supabase SQL editor
-- AFTER migration 054 has been applied.
--
-- Asserts the 6-step scenario:
--   1. Create one child_document in draft
--   2. Add version 1
--   3. Set current_version_id to v1 and status = 'active'
--   4. Add version 2 and update current_version_id to v2
--   5. Hide version 2  → head must repoint to v1
--   6. Hide version 1  → must FAIL with the documented exception
--
-- Each step is verified with a NOTICE; any deviation raises.
-- The whole script runs inside a single implicit transaction; the
-- intentional Step 6 exception is caught locally so cleanup still runs.
-- If anything BEFORE cleanup raises unexpectedly, the entire transaction
-- rolls back and no junk rows are left behind.
-- ============================================================

DO $$
DECLARE
  v_school_id   UUID;
  v_student_id  UUID;
  v_user_id     UUID;
  v_doc_id      UUID;
  v_v1_id       UUID;
  v_v2_id       UUID;
  v_current     UUID;
  v_status      document_status;
  v_v2_hidden   BOOLEAN;
  v_v2_hidden_at TIMESTAMPTZ;
BEGIN
  ----------------------------------------------------------------
  -- Resolve fixtures from existing seed data
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools LIMIT 1;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no schools row found — apply seeds first';
  END IF;

  SELECT id INTO v_student_id FROM students WHERE school_id = v_school_id LIMIT 1;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'no students row found for school %', v_school_id;
  END IF;

  SELECT id INTO v_user_id
  FROM profiles
  WHERE school_id = v_school_id AND role IN ('school_admin','teacher')
  LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'no admin/teacher profile found for school %', v_school_id;
  END IF;

  RAISE NOTICE 'Fixtures: school=% student=% user=%', v_school_id, v_student_id, v_user_id;

  ----------------------------------------------------------------
  -- Step 1: create draft document
  ----------------------------------------------------------------
  INSERT INTO child_documents (
    school_id, student_id, document_type, title, status, created_by
  )
  VALUES (
    v_school_id, v_student_id, 'iep', 'TEST 054 — delete me', 'draft', v_user_id
  )
  RETURNING id INTO v_doc_id;

  SELECT status, current_version_id INTO v_status, v_current
  FROM child_documents WHERE id = v_doc_id;
  IF v_status <> 'draft' OR v_current IS NOT NULL THEN
    RAISE EXCEPTION 'Step 1 FAILED — expected (draft, NULL), got (%, %)', v_status, v_current;
  END IF;
  RAISE NOTICE 'Step 1 PASSED — doc % created in draft with no current version', v_doc_id;

  ----------------------------------------------------------------
  -- Step 2: add version 1
  ----------------------------------------------------------------
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path,
    uploaded_by_user_id, uploaded_by_kind
  )
  VALUES (
    v_doc_id, v_school_id, 1,
    'child-documents/' || v_school_id || '/' || v_student_id || '/' || v_doc_id || '/v1.pdf',
    v_user_id, 'school_admin'
  )
  RETURNING id INTO v_v1_id;
  RAISE NOTICE 'Step 2 PASSED — version 1 inserted (id=%)', v_v1_id;

  ----------------------------------------------------------------
  -- Step 3: point head at v1 and flip to 'active'
  ----------------------------------------------------------------
  UPDATE child_documents
    SET current_version_id = v_v1_id, status = 'active'
    WHERE id = v_doc_id;

  SELECT status, current_version_id INTO v_status, v_current
  FROM child_documents WHERE id = v_doc_id;
  IF v_status <> 'active' OR v_current IS DISTINCT FROM v_v1_id THEN
    RAISE EXCEPTION 'Step 3 FAILED — expected (active, %), got (%, %)', v_v1_id, v_status, v_current;
  END IF;
  RAISE NOTICE 'Step 3 PASSED — head now (active, current=%)', v_current;

  ----------------------------------------------------------------
  -- Step 4: add version 2 and repoint head
  ----------------------------------------------------------------
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path,
    uploaded_by_user_id, uploaded_by_kind
  )
  VALUES (
    v_doc_id, v_school_id, 2,
    'child-documents/' || v_school_id || '/' || v_student_id || '/' || v_doc_id || '/v2.pdf',
    v_user_id, 'school_admin'
  )
  RETURNING id INTO v_v2_id;

  UPDATE child_documents
    SET current_version_id = v_v2_id
    WHERE id = v_doc_id;

  SELECT current_version_id INTO v_current FROM child_documents WHERE id = v_doc_id;
  IF v_current IS DISTINCT FROM v_v2_id THEN
    RAISE EXCEPTION 'Step 4 FAILED — expected current=%, got %', v_v2_id, v_current;
  END IF;
  RAISE NOTICE 'Step 4 PASSED — version 2 added (id=%) and head repointed', v_v2_id;

  ----------------------------------------------------------------
  -- Step 5: hide v2 — trigger 5.E should repoint head to v1
  ----------------------------------------------------------------
  UPDATE child_document_versions
    SET is_hidden = TRUE, hidden_reason = 'wrong upload'
    WHERE id = v_v2_id;

  SELECT is_hidden, hidden_at INTO v_v2_hidden, v_v2_hidden_at
  FROM child_document_versions WHERE id = v_v2_id;
  IF NOT v_v2_hidden OR v_v2_hidden_at IS NULL THEN
    RAISE EXCEPTION 'Step 5 FAILED — v2 hide flags inconsistent (is_hidden=%, hidden_at=%)',
      v_v2_hidden, v_v2_hidden_at;
  END IF;

  SELECT current_version_id INTO v_current FROM child_documents WHERE id = v_doc_id;
  IF v_current IS DISTINCT FROM v_v1_id THEN
    RAISE EXCEPTION 'Step 5 FAILED — expected head to repoint to v1 (%), got %', v_v1_id, v_current;
  END IF;
  RAISE NOTICE 'Step 5 PASSED — v2 hidden (hidden_at auto-set), head repointed to v1';

  ----------------------------------------------------------------
  -- Step 6: try to hide v1 — must fail because doc is 'active' and no replacement
  ----------------------------------------------------------------
  BEGIN
    UPDATE child_document_versions
      SET is_hidden = TRUE, hidden_reason = 'should not work'
      WHERE id = v_v1_id;
    -- If we reach here, the trigger did not raise.
    RAISE EXCEPTION 'Step 6 FAILED — UPDATE was not rejected';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'cannot hide the only visible version%' THEN
        RAISE NOTICE 'Step 6 PASSED — got expected exception: %', SQLERRM;
      ELSE
        RAISE EXCEPTION 'Step 6 raised the WRONG exception: %', SQLERRM;
      END IF;
  END;

  -- Sanity: head/v1 state unchanged after the rejected update
  SELECT current_version_id, status INTO v_current, v_status FROM child_documents WHERE id = v_doc_id;
  IF v_current IS DISTINCT FROM v_v1_id OR v_status <> 'active' THEN
    RAISE EXCEPTION 'Step 6 post-check FAILED — head changed unexpectedly: current=%, status=%',
      v_current, v_status;
  END IF;
  RAISE NOTICE 'Post-Step-6 sanity PASSED — head still (active, current=v1)';

  ----------------------------------------------------------------
  -- Cleanup (must move head back to draft before deleting versions
  -- because the CHECK (status=draft OR current_version_id NOT NULL)
  -- fires when the FK SET NULL kicks in on version delete)
  ----------------------------------------------------------------
  UPDATE child_documents
    SET status = 'draft', current_version_id = NULL
    WHERE id = v_doc_id;
  DELETE FROM child_document_versions WHERE document_id = v_doc_id;
  DELETE FROM child_documents WHERE id = v_doc_id;

  RAISE NOTICE 'ALL STEPS PASSED. Test artifacts cleaned up.';
END $$;

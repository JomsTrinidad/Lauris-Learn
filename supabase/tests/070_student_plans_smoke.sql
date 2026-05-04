-- ============================================================
-- Smoke tests for migration 070 — Plans & Forms (student_plans family)
--
-- Scope (deliberately narrow):
--   T-1  school_admin can create / edit / approve / archive an IEP plan
--   T-2  teacher can create + edit drafts for students they teach
--   T-3  teacher CANNOT create plans for students they do not teach
--   T-4  teacher CANNOT approve or archive
--   T-5  parent has no read or write access (skipped if no parent profile)
--   T-6  attachments can link to existing child_documents
--   T-7  deleting a goal sets linked progress entries' linked_goal_id to NULL
--   T-8  Documents (child_documents) and Requests (document_requests) are
--        unaffected by migration 070
--
-- Run ONLY in a non-production project (Supabase SQL Editor with the
-- service role, or psql as a Postgres superuser). The whole script runs
-- inside BEGIN/ROLLBACK so all fixtures and test data are discarded —
-- change the trailing ROLLBACK to COMMIT to keep them for inspection.
--
-- Impersonation is the same pattern as supabase/tests/056_phase_b_scenarios.sql:
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","email":"<email>"}';
-- These reset on the surrounding transaction's end.
--
-- For the teacher tests, we wire the teacher's auth.uid() through the
-- teacher_profiles bridge (migration 066) so teacher_visible_student_ids()
-- resolves correctly. Without that, the teacher would see zero students
-- and T-2 would fail for the wrong reason.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- Existing fixtures
  v_school_id          UUID;
  v_admin_id           UUID;        -- profiles.id of a school_admin
  v_teacher_uid        UUID;        -- profiles.id (== auth.uid()) for a teacher
  v_teacher_prof_id    UUID;        -- teacher_profiles.id (separate from auth.uid)
  v_school_year_id     UUID;
  v_parent_uid         UUID;        -- profiles.id of a parent (skipped if NULL)
  v_parent_email       TEXT;

  -- Fixtures we synthesize for isolation
  v_class_in_id        UUID;
  v_class_out_id       UUID;
  v_student_visible    UUID;        -- enrolled in class_in (teacher CAN see)
  v_student_hidden     UUID;        -- enrolled in class_out (teacher CANNOT see)
  v_doc_id             UUID;        -- existing uploaded document for attachments
  v_req_id             UUID;        -- existing document_request (T-8 sanity)

  -- Plan ids
  v_plan_admin         UUID;
  v_plan_teacher       UUID;

  -- Sub-row ids
  v_goal_id            UUID;
  v_progress_id        UUID;
  v_intervention_id    UUID;
  v_attachment_id      UUID;

  -- Result holders
  v_caught             BOOLEAN;
  v_count              INT;
  v_status_after       plan_status;
  v_linked_goal_after  UUID;
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve fixtures (script bails cleanly if missing)
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school found'; END IF;

  SELECT id INTO v_admin_id
    FROM profiles
    WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at
    LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin profile in school'; END IF;

  SELECT id INTO v_teacher_uid
    FROM profiles
    WHERE school_id = v_school_id AND role = 'teacher'
    ORDER BY created_at
    LIMIT 1;
  IF v_teacher_uid IS NULL THEN
    RAISE EXCEPTION 'need at least one teacher profile in school for tests';
  END IF;

  SELECT id INTO v_school_year_id
    FROM school_years
    WHERE school_id = v_school_id AND status = 'active'
    LIMIT 1;
  IF v_school_year_id IS NULL THEN
    SELECT id INTO v_school_year_id
      FROM school_years
      WHERE school_id = v_school_id
      ORDER BY start_date DESC
      LIMIT 1;
  END IF;
  IF v_school_year_id IS NULL THEN RAISE EXCEPTION 'no school_year for school'; END IF;

  -- Optional: a real parent profile (created when a parent accepted an invite).
  -- T-5 is skipped if none exists.
  SELECT id, email INTO v_parent_uid, v_parent_email
    FROM profiles
    WHERE role = 'parent'
    LIMIT 1;

  ----------------------------------------------------------------
  -- 1. Synthesize isolated test fixtures
  ----------------------------------------------------------------

  -- Two classes in the active SY
  INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time)
    VALUES (v_school_id, v_school_year_id, 'TEST 070 — class IN', 'Test', '08:00', '11:00')
    RETURNING id INTO v_class_in_id;

  INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time)
    VALUES (v_school_id, v_school_year_id, 'TEST 070 — class OUT', 'Test', '13:00', '15:00')
    RETURNING id INTO v_class_out_id;

  -- Two students; one enrolled in class_in, one in class_out
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id, 'TEST070', 'Visible')
    RETURNING id INTO v_student_visible;

  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id, 'TEST070', 'Hidden')
    RETURNING id INTO v_student_hidden;

  INSERT INTO enrollments (student_id, class_id, school_year_id, status, enrolled_at)
    VALUES (v_student_visible, v_class_in_id, v_school_year_id, 'enrolled', NOW());
  INSERT INTO enrollments (student_id, class_id, school_year_id, status, enrolled_at)
    VALUES (v_student_hidden, v_class_out_id, v_school_year_id, 'enrolled', NOW());

  -- Bridge teacher auth.uid() → teacher_profiles.id (migration 066 contract).
  -- If a row already exists for this teacher, reuse it; else create one.
  SELECT id INTO v_teacher_prof_id
    FROM teacher_profiles
    WHERE school_id = v_school_id AND auth_user_id = v_teacher_uid;
  IF v_teacher_prof_id IS NULL THEN
    INSERT INTO teacher_profiles (school_id, full_name, email, auth_user_id)
      SELECT v_school_id, p.full_name, p.email, v_teacher_uid
        FROM profiles p
        WHERE p.id = v_teacher_uid
      RETURNING id INTO v_teacher_prof_id;
  END IF;

  -- Map teacher to class_in only (and DEFINITELY not class_out, in case
  -- a previous test left them attached there).
  INSERT INTO class_teachers (class_id, teacher_id)
    VALUES (v_class_in_id, v_teacher_prof_id)
    ON CONFLICT (class_id, teacher_id) DO NOTHING;
  DELETE FROM class_teachers
    WHERE class_id = v_class_out_id AND teacher_id = v_teacher_prof_id;

  -- Existing uploaded document for the visible student (used by T-6 + T-8)
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_visible, 'parent_provided',
            'TEST 070 attachable doc', 'draft', v_admin_id)
    RETURNING id INTO v_doc_id;

  -- Sanity: helper should now report v_student_visible (only) as visible to the teacher
  -- We can't call the helper outside the teacher's session context in a
  -- meaningful way (it reads auth.uid()), so we leave this to T-2/T-3.

  RAISE NOTICE 'Fixtures: school=% admin=% teacher_uid=% teacher_prof=% class_in=% class_out=% student_visible=% student_hidden=% doc=%',
    v_school_id, v_admin_id, v_teacher_uid, v_teacher_prof_id,
    v_class_in_id, v_class_out_id, v_student_visible, v_student_hidden, v_doc_id;


  ----------------------------------------------------------------
  -- T-1  school_admin can create / edit / approve / archive
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin070@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Create
  INSERT INTO student_plans (school_id, student_id, school_year_id, plan_type, title, status, created_by)
    VALUES (v_school_id, v_student_visible, v_school_year_id, 'iep',
            'TEST 070 — admin plan', 'draft', v_admin_id)
    RETURNING id INTO v_plan_admin;

  -- Edit (head field)
  UPDATE student_plans
     SET title = 'TEST 070 — admin plan (edited)'
     WHERE id = v_plan_admin;
  IF NOT EXISTS (
    SELECT 1 FROM student_plans
    WHERE id = v_plan_admin AND title LIKE '%(edited)%'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: admin edit did not persist';
  END IF;

  -- Approve via the same admin path the UI takes
  UPDATE student_plans
     SET status = 'submitted'
     WHERE id = v_plan_admin;
  UPDATE student_plans
     SET status = 'approved', approved_at = NOW(), approved_by = v_admin_id
     WHERE id = v_plan_admin;
  SELECT status INTO v_status_after FROM student_plans WHERE id = v_plan_admin;
  IF v_status_after <> 'approved' THEN
    RAISE EXCEPTION 'T-1 FAILED: status after Approve = % (expected approved)', v_status_after;
  END IF;

  -- Archive
  UPDATE student_plans
     SET status = 'archived', archived_at = NOW()
     WHERE id = v_plan_admin;
  SELECT status INTO v_status_after FROM student_plans WHERE id = v_plan_admin;
  IF v_status_after <> 'archived' THEN
    RAISE EXCEPTION 'T-1 FAILED: status after Archive = % (expected archived)', v_status_after;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-1 PASSED: school_admin can create + edit + approve + archive';


  ----------------------------------------------------------------
  -- Pre-T-2 setup: revert v_plan_admin to draft (terminal status would
  -- block T-6/T-7 sub-row writes by anyone but admin/super_admin). We do
  -- this back as superuser to bypass RLS — the test of the *transitions*
  -- already passed in T-1 above.
  ----------------------------------------------------------------
  UPDATE student_plans
     SET status = 'draft', archived_at = NULL, approved_at = NULL, approved_by = NULL
     WHERE id = v_plan_admin;


  ----------------------------------------------------------------
  -- T-6  attachments can link to existing child_documents
  -- T-7  ON DELETE SET NULL on linked_goal_id
  --
  -- Both run as the school_admin while v_plan_admin is in 'draft' so the
  -- sub-row writes pass RLS.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin070@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Goal + linked progress entry
  INSERT INTO student_plan_goals (plan_id, description)
    VALUES (v_plan_admin, 'TEST 070 — goal A')
    RETURNING id INTO v_goal_id;

  INSERT INTO student_plan_progress_entries (plan_id, linked_goal_id, progress_note)
    VALUES (v_plan_admin, v_goal_id, 'TEST 070 — progress note')
    RETURNING id INTO v_progress_id;

  -- Intervention (sanity)
  INSERT INTO student_plan_interventions (plan_id, strategy)
    VALUES (v_plan_admin, 'TEST 070 — intervention')
    RETURNING id INTO v_intervention_id;

  -- T-6: attach the existing child_documents row
  INSERT INTO student_plan_attachments (plan_id, document_id, attached_by)
    VALUES (v_plan_admin, v_doc_id, v_admin_id)
    RETURNING id INTO v_attachment_id;

  IF NOT EXISTS (
    SELECT 1 FROM student_plan_attachments
    WHERE plan_id = v_plan_admin AND document_id = v_doc_id
  ) THEN
    RAISE EXCEPTION 'T-6 FAILED: attachment row did not persist';
  END IF;
  RAISE NOTICE 'T-6 PASSED: attachments can link to existing child_documents';

  -- T-7: delete the goal — linked progress entry's linked_goal_id should become NULL
  DELETE FROM student_plan_goals WHERE id = v_goal_id;
  SELECT linked_goal_id INTO v_linked_goal_after
    FROM student_plan_progress_entries
    WHERE id = v_progress_id;
  IF v_linked_goal_after IS NOT NULL THEN
    RAISE EXCEPTION 'T-7 FAILED: linked_goal_id = % after goal delete (expected NULL)', v_linked_goal_after;
  END IF;
  RAISE NOTICE 'T-7 PASSED: deleting a goal sets linked progress entries to NULL';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-2  teacher can create + edit drafts for visible students
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_uid::text, 'email', 't070@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Create draft for visible student → ALLOW
  INSERT INTO student_plans (school_id, student_id, school_year_id, plan_type, title, status, created_by)
    VALUES (v_school_id, v_student_visible, v_school_year_id, 'iep',
            'TEST 070 — teacher plan', 'draft', v_teacher_uid)
    RETURNING id INTO v_plan_teacher;

  -- Edit own draft → ALLOW
  UPDATE student_plans
     SET title = 'TEST 070 — teacher plan (edited)'
     WHERE id = v_plan_teacher;
  IF NOT EXISTS (
    SELECT 1 FROM student_plans
    WHERE id = v_plan_teacher AND title LIKE '%(edited)%'
  ) THEN
    RAISE EXCEPTION 'T-2 FAILED: teacher edit did not persist';
  END IF;

  -- Submit For Review (draft → submitted) → ALLOW
  UPDATE student_plans
     SET status = 'submitted'
     WHERE id = v_plan_teacher;
  SELECT status INTO v_status_after FROM student_plans WHERE id = v_plan_teacher;
  IF v_status_after <> 'submitted' THEN
    RAISE EXCEPTION 'T-2 FAILED: teacher could not move to submitted (status=%)', v_status_after;
  END IF;

  RAISE NOTICE 'T-2 PASSED: teacher can create + edit drafts and Submit For Review';


  ----------------------------------------------------------------
  -- T-3  teacher CANNOT create plans for students outside their classes
  --
  -- INSERT failures from RLS surface as insufficient_privilege (42501).
  ----------------------------------------------------------------
  v_caught := FALSE;
  BEGIN
    INSERT INTO student_plans (school_id, student_id, school_year_id, plan_type, title, status, created_by)
      VALUES (v_school_id, v_student_hidden, v_school_year_id, 'iep',
              'TEST 070 — should be rejected', 'draft', v_teacher_uid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;

  IF NOT v_caught THEN
    -- Cleanup any row that slipped through, then fail the test
    DELETE FROM student_plans
      WHERE school_id = v_school_id
        AND title = 'TEST 070 — should be rejected';
    RAISE EXCEPTION 'T-3 FAILED: teacher INSERT for non-visible student should have raised 42501';
  END IF;
  RAISE NOTICE 'T-3 PASSED: teacher cannot create plans for students they do not teach';


  ----------------------------------------------------------------
  -- T-4  teacher CANNOT approve or archive
  --
  -- The teacher UPDATE policy's WITH CHECK requires the post-update row to
  -- have status IN ('draft','submitted','in_review'). Setting status to
  -- 'approved' or 'archived' violates WITH CHECK → 42501.
  ----------------------------------------------------------------

  -- T-4a  Approve attempt
  v_caught := FALSE;
  BEGIN
    UPDATE student_plans
       SET status      = 'approved',
           approved_at = NOW(),
           approved_by = v_teacher_uid
       WHERE id = v_plan_teacher;
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;

  IF NOT v_caught THEN
    -- Belt-and-suspenders: even if no error fired, the row must not have
    -- changed (e.g. if USING somehow filtered the row out silently).
    SELECT status INTO v_status_after FROM student_plans WHERE id = v_plan_teacher;
    IF v_status_after = 'approved' THEN
      RAISE EXCEPTION 'T-4a FAILED: teacher Approve persisted (status=%)', v_status_after;
    ELSE
      RAISE EXCEPTION 'T-4a FAILED: teacher Approve did not raise 42501 (status still=%)',
        v_status_after;
    END IF;
  END IF;
  RAISE NOTICE 'T-4a PASSED: teacher cannot Approve';

  -- T-4b  Archive attempt
  v_caught := FALSE;
  BEGIN
    UPDATE student_plans
       SET status      = 'archived',
           archived_at = NOW()
       WHERE id = v_plan_teacher;
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;

  IF NOT v_caught THEN
    SELECT status INTO v_status_after FROM student_plans WHERE id = v_plan_teacher;
    IF v_status_after = 'archived' THEN
      RAISE EXCEPTION 'T-4b FAILED: teacher Archive persisted (status=%)', v_status_after;
    ELSE
      RAISE EXCEPTION 'T-4b FAILED: teacher Archive did not raise 42501 (status still=%)',
        v_status_after;
    END IF;
  END IF;
  RAISE NOTICE 'T-4b PASSED: teacher cannot Archive';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-5  parent has no access (skipped if no parent profile exists)
  --
  --   - SELECT student_plans → returns 0 rows (RLS hides everything)
  --   - INSERT student_plans → 42501 (no parent WITH CHECK clause matches)
  ----------------------------------------------------------------
  IF v_parent_uid IS NULL THEN
    RAISE NOTICE 'T-5 SKIPPED: no parent profile in this database';
  ELSE
    EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
      jsonb_build_object('sub', v_parent_uid::text, 'email', v_parent_email)::text);
    SET LOCAL ROLE authenticated;

    SELECT count(*) INTO v_count FROM student_plans;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'T-5 FAILED: parent SELECT returned % rows (expected 0)', v_count;
    END IF;

    v_caught := FALSE;
    BEGIN
      INSERT INTO student_plans (school_id, student_id, school_year_id, plan_type, title, status, created_by)
        VALUES (v_school_id, v_student_visible, v_school_year_id, 'iep',
                'TEST 070 — parent should be rejected', 'draft', v_parent_uid);
    EXCEPTION WHEN insufficient_privilege THEN
      v_caught := TRUE;
    END;
    IF NOT v_caught THEN
      DELETE FROM student_plans
        WHERE school_id = v_school_id
          AND title = 'TEST 070 — parent should be rejected';
      RAISE EXCEPTION 'T-5 FAILED: parent INSERT should have raised 42501';
    END IF;

    RESET ROLE;
    RAISE NOTICE 'T-5 PASSED: parent has no SELECT or INSERT access';
  END IF;


  ----------------------------------------------------------------
  -- T-8  Documents (child_documents) and Requests (document_requests) are
  --      not impacted by migration 070.
  --
  --   - school_admin can still SELECT and INSERT child_documents.
  --   - school_admin can still INSERT a document_request.
  -- This catches the obvious failure mode: migration 070 broke a shared
  -- helper or RLS policy on the document tables.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin070@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- The document we created at fixture time should still be visible.
  IF NOT EXISTS (SELECT 1 FROM child_documents WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'T-8 FAILED: school_admin lost SELECT access to child_documents';
  END IF;

  -- New document insert should still work.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_visible, 'medical_certificate',
            'TEST 070 — post-migration doc', 'draft', v_admin_id);

  -- Document request insert should still work.
  INSERT INTO document_requests (
    school_id, student_id, requested_document_type,
    requester_user_id, requested_from_kind, reason
  ) VALUES (
    v_school_id, v_student_visible, 'iep',
    v_admin_id, 'parent', 'TEST 070 — post-migration request'
  ) RETURNING id INTO v_req_id;

  IF NOT EXISTS (SELECT 1 FROM document_requests WHERE id = v_req_id) THEN
    RAISE EXCEPTION 'T-8 FAILED: document_requests INSERT did not persist';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-8 PASSED: child_documents + document_requests still work';


  ----------------------------------------------------------------
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'Migration 070 smoke test: ALL SCENARIOS PASSED';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$ LANGUAGE plpgsql;

-- Discard everything we created. Change to COMMIT to inspect the rows.
ROLLBACK;

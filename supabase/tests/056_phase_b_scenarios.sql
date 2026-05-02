-- ============================================================
-- Test scenarios for Phase B (migration 056) — log_document_access RPC
--
-- This script exercises the access decision tree by impersonating
-- different actors. Impersonation works by setting local-only GUCs:
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","email":"<email>"}';
-- These reset on COMMIT (or on the surrounding transaction's end).
--
-- Run ONLY in a non-production project. The script:
--   - creates two synthetic students under the same school
--   - assigns class-teacher mappings
--   - creates a draft → active → shared document with v1 then v2
--   - issues consent + grants
--   - calls log_document_access from various actor contexts
--   - asserts allowed/denied + verifies document_access_events rows
--   - cleans up at the end
--
-- All work happens inside a single explicit BEGIN/ROLLBACK so even
-- the audit/event rows we create are discarded. To keep the events
-- (e.g. for inspection), change the trailing ROLLBACK to COMMIT.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- Existing fixtures
  v_school_id        UUID;
  v_admin_id         UUID;
  v_teacher_in_id    UUID;        -- teacher whose class includes student A
  v_teacher_out_id   UUID;        -- teacher whose class does NOT include student A
  v_parent_email     TEXT;
  v_guardian_id      UUID;
  v_other_school_id  UUID;
  v_other_admin_id   UUID;

  v_class_in_id      UUID;
  v_class_out_id     UUID;
  v_school_year_id   UUID;
  v_student_a_id     UUID;
  v_student_b_id     UUID;        -- not in either tested class
  v_guardian_a       UUID;

  -- Real parent profiles for B-6/B-7/B-8. NULL when no parent has accepted
  -- their invite yet — those scenarios are skipped (with NOTICE) in that case.
  v_parent_profile_id        UUID;
  v_other_parent_profile_id  UUID;
  v_other_parent_email       TEXT;

  -- New fixtures we create
  v_doc_id           UUID;
  v_v1_id            UUID;
  v_v2_id            UUID;
  v_consent_id       UUID;
  v_grant_id         UUID;
  v_extc_id          UUID;
  v_extc_email       TEXT := 'test-doctor-056@example.com';

  -- Result holders
  v_result           JSONB;
  v_event_count      INT;
BEGIN
  ----------------------------------------------------------------
  -- Resolve fixtures (stops cleanly if missing)
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school found'; END IF;

  SELECT id INTO v_admin_id   FROM profiles WHERE school_id = v_school_id AND role = 'school_admin' LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin profile in school'; END IF;

  -- Two distinct teachers; if only one exists we'll synthesize the second
  SELECT id INTO v_teacher_in_id  FROM profiles WHERE school_id = v_school_id AND role = 'teacher' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_teacher_out_id FROM profiles WHERE school_id = v_school_id AND role = 'teacher' AND id <> v_teacher_in_id ORDER BY created_at LIMIT 1;
  IF v_teacher_in_id IS NULL OR v_teacher_out_id IS NULL THEN
    RAISE EXCEPTION 'need at least 2 teacher profiles for this test';
  END IF;

  -- A second school (for cross-school denial tests)
  SELECT id INTO v_other_school_id FROM schools WHERE id <> v_school_id LIMIT 1;
  IF v_other_school_id IS NOT NULL THEN
    SELECT id INTO v_other_admin_id FROM profiles WHERE school_id = v_other_school_id AND role = 'school_admin' LIMIT 1;
  END IF;

  -- Active school year for enrollments
  SELECT id INTO v_school_year_id FROM school_years WHERE school_id = v_school_id AND status = 'active' LIMIT 1;
  IF v_school_year_id IS NULL THEN RAISE EXCEPTION 'no active school_year'; END IF;

  -- Two students
  SELECT id INTO v_student_a_id FROM students WHERE school_id = v_school_id ORDER BY created_at LIMIT 1;
  SELECT id INTO v_student_b_id FROM students WHERE school_id = v_school_id AND id <> v_student_a_id ORDER BY created_at LIMIT 1;
  IF v_student_a_id IS NULL OR v_student_b_id IS NULL THEN
    RAISE EXCEPTION 'need at least 2 students in school';
  END IF;

  -- Guardian for student A
  SELECT id, email INTO v_guardian_a, v_parent_email FROM guardians WHERE student_id = v_student_a_id ORDER BY created_at LIMIT 1;
  IF v_guardian_a IS NULL OR v_parent_email IS NULL THEN
    RAISE EXCEPTION 'student A has no guardian with email';
  END IF;

  -- Resolve a real parent profile for student A (created when the parent
  -- accepted their invite). If absent, B-6/B-7 will be skipped — the
  -- access decision tree distinguishes "parent" from "unauthenticated"
  -- only when a profiles row with role='parent' exists.
  SELECT id INTO v_parent_profile_id
    FROM profiles
    WHERE lower(email) = lower(v_parent_email)
      AND role = 'parent'
    LIMIT 1;

  -- Resolve a parent profile for some OTHER family (B-8). Picks any guardian
  -- email distinct from student A's primary that has a matching parent profile.
  SELECT g.email, p.id
    INTO v_other_parent_email, v_other_parent_profile_id
    FROM guardians g
    JOIN profiles  p ON lower(p.email) = lower(g.email) AND p.role = 'parent'
    WHERE g.student_id <> v_student_a_id
      AND g.email IS NOT NULL
      AND lower(g.email) <> lower(v_parent_email)
    ORDER BY g.created_at
    LIMIT 1;

  -- ── class_in: the class that has student A enrolled (and teacher_in teaches) ─
  -- 1. Try to find an existing enrolled record for student A in the active year.
  SELECT class_id INTO v_class_in_id
    FROM enrollments
    WHERE student_id     = v_student_a_id
      AND school_year_id = v_school_year_id
      AND status         = 'enrolled'
    LIMIT 1;

  IF v_class_in_id IS NULL THEN
    -- 2. Pick any class in the school's active year and enroll A there.
    SELECT id INTO v_class_in_id
      FROM classes
      WHERE school_id = v_school_id AND school_year_id = v_school_year_id
      LIMIT 1;

    IF v_class_in_id IS NULL THEN
      -- 3. Synthesize a class (rolled back at end of test).
      INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time)
        VALUES (v_school_id, v_school_year_id, 'TEST 056 — class IN', 'Test', '08:00', '11:00')
        RETURNING id INTO v_class_in_id;
    END IF;

    INSERT INTO enrollments (student_id, class_id, school_year_id, status, enrolled_at)
      VALUES (v_student_a_id, v_class_in_id, v_school_year_id, 'enrolled', NOW())
      ON CONFLICT (student_id, school_year_id) DO UPDATE
        SET class_id = EXCLUDED.class_id,
            status   = 'enrolled';
  END IF;

  -- Ensure teacher_in is registered to class_in
  INSERT INTO class_teachers (class_id, teacher_id)
    VALUES (v_class_in_id, v_teacher_in_id)
    ON CONFLICT (class_id, teacher_id) DO NOTHING;

  -- ── class_out: a different class that does NOT have student A ────────────
  SELECT id INTO v_class_out_id
    FROM classes
    WHERE school_id = v_school_id
      AND school_year_id = v_school_year_id
      AND id <> v_class_in_id
    LIMIT 1;

  IF v_class_out_id IS NULL THEN
    INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time)
      VALUES (v_school_id, v_school_year_id, 'TEST 056 — class OUT', 'Test', '13:00', '15:00')
      RETURNING id INTO v_class_out_id;
  END IF;

  -- Ensure teacher_out is registered to class_out (and NOT to class_in)
  INSERT INTO class_teachers (class_id, teacher_id)
    VALUES (v_class_out_id, v_teacher_out_id)
    ON CONFLICT (class_id, teacher_id) DO NOTHING;
  DELETE FROM class_teachers WHERE class_id = v_class_in_id AND teacher_id = v_teacher_out_id;

  -- Sanity: student A must NOT be enrolled in class_out
  -- (The UNIQUE (student_id, school_year_id) constraint already prevents A
  --  from being in two classes for this year, so this is a defense-in-depth check.)
  IF EXISTS (
    SELECT 1 FROM enrollments
    WHERE student_id = v_student_a_id
      AND class_id   = v_class_out_id
      AND status     = 'enrolled'
  ) THEN
    RAISE EXCEPTION 'fixtures: student A unexpectedly enrolled in class_out — adjust test data';
  END IF;

  RAISE NOTICE 'Fixtures OK: school=% admin=% teacher_in=% teacher_out=% studentA=% guardianA=%',
    v_school_id, v_admin_id, v_teacher_in_id, v_teacher_out_id, v_student_a_id, v_guardian_a;

  ----------------------------------------------------------------
  -- Create test artifacts (run as service role; RLS is irrelevant
  -- here because the DO block runs as the connecting user)
  ----------------------------------------------------------------
  -- An external contact we'll grant access to
  INSERT INTO external_contacts (school_id, full_name, email, organization_name, role_title)
    VALUES (v_school_id, 'Dr. Test 056', v_extc_email, 'Test Clinic', 'Pediatrician')
    RETURNING id INTO v_extc_id;

  -- Doc + v1 + v2; status='shared' to allow parent to see it
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_a_id, 'iep', 'TEST 056 IEP — delete me', 'draft', v_admin_id)
    RETURNING id INTO v_doc_id;

  INSERT INTO child_document_versions (document_id, school_id, version_number, storage_path, uploaded_by_user_id, uploaded_by_kind, mime_type)
    VALUES (v_doc_id, v_school_id, 1, v_school_id::TEXT||'/'||v_student_a_id||'/'||v_doc_id||'/v1.pdf', v_admin_id, 'school_admin', 'application/pdf')
    RETURNING id INTO v_v1_id;
  UPDATE child_documents SET current_version_id = v_v1_id, status = 'active' WHERE id = v_doc_id;

  INSERT INTO child_document_versions (document_id, school_id, version_number, storage_path, uploaded_by_user_id, uploaded_by_kind, mime_type)
    VALUES (v_doc_id, v_school_id, 2, v_school_id::TEXT||'/'||v_student_a_id||'/'||v_doc_id||'/v2.pdf', v_admin_id, 'school_admin', 'application/pdf')
    RETURNING id INTO v_v2_id;
  UPDATE child_documents SET current_version_id = v_v2_id WHERE id = v_doc_id;

  -- Consent: scope=document, recipient=external_contact, granted, expires +30 days
  INSERT INTO document_consents (
    school_id, student_id, granted_by_guardian_id, purpose,
    scope, recipients, allow_download, allow_reshare,
    status, expires_at, granted_at, requested_by_user_id
  ) VALUES (
    v_school_id, v_student_a_id, v_guardian_a, 'TEST 056 — share IEP with doctor',
    jsonb_build_object('type','document','document_id', v_doc_id::text),
    jsonb_build_array(jsonb_build_object('type','external_contact','external_contact_id', v_extc_id::text, 'email', v_extc_email)),
    FALSE, FALSE,
    'granted', NOW() + INTERVAL '30 days', NOW(), v_admin_id
  ) RETURNING id INTO v_consent_id;

  -- Grant for the external contact (consent_id required)
  INSERT INTO document_access_grants (
    document_id, school_id, consent_id,
    grantee_kind, grantee_external_contact_id,
    permissions, expires_at, created_by
  ) VALUES (
    v_doc_id, v_school_id, v_consent_id,
    'external_contact', v_extc_id,
    '{"view":true,"download":false,"comment":false,"upload_new_version":false}'::jsonb,
    NOW() + INTERVAL '20 days', v_admin_id
  ) RETURNING id INTO v_grant_id;

  -- Flip doc to 'shared'
  UPDATE child_documents SET status = 'shared' WHERE id = v_doc_id;

  RAISE NOTICE 'Created doc=% v1=% v2=% consent=% grant=% extc=%',
    v_doc_id, v_v1_id, v_v2_id, v_consent_id, v_grant_id, v_extc_id;

  ----------------------------------------------------------------
  -- Helper macro pattern: SET LOCAL JWT, call RPC, assert
  ----------------------------------------------------------------

  -- B-1  school_admin same school → ALLOW
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin-test@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '127.0.0.1', 'pg-test/1.0');
  RESET ROLE;
  IF NOT (v_result->>'allowed')::BOOLEAN THEN
    RAISE EXCEPTION 'B-1 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-1 PASSED: school_admin ALLOW';

  -- B-3  teacher in scope (class includes student A)  → ALLOW
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_in_id::text, 'email', 'tin@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '', '');
  RESET ROLE;
  IF NOT (v_result->>'allowed')::BOOLEAN THEN
    RAISE EXCEPTION 'B-3 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-3 PASSED: teacher in class ALLOW';

  -- B-4  teacher out of scope, no grant  → DENY teacher_class_scope
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_out_id::text, 'email', 'tout@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '', '');
  RESET ROLE;
  IF (v_result->>'allowed')::BOOLEAN OR v_result->>'denied_reason' <> 'teacher_class_scope' THEN
    RAISE EXCEPTION 'B-4 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-4 PASSED: teacher out of class DENY (teacher_class_scope)';

  -- B-5  same teacher_out gets explicit grant → ALLOW
  INSERT INTO document_access_grants (
    document_id, school_id, grantee_kind, grantee_user_id,
    permissions, expires_at, created_by
  ) VALUES (
    v_doc_id, v_school_id, 'school_user', v_teacher_out_id,
    '{"view":true,"download":true,"comment":false,"upload_new_version":false}'::jsonb,
    NOW() + INTERVAL '7 days', v_admin_id
  );
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_out_id::text, 'email', 'tout@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '', '');
  RESET ROLE;
  IF NOT (v_result->>'allowed')::BOOLEAN THEN
    RAISE EXCEPTION 'B-5 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-5 PASSED: teacher with explicit grant ALLOW';

  -- B-6  parent reading shared doc about own kid  → ALLOW
  IF v_parent_profile_id IS NOT NULL THEN
    EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
      jsonb_build_object('sub', v_parent_profile_id::text, 'email', v_parent_email)::text);
    SET LOCAL ROLE authenticated;
    v_result := log_document_access(v_doc_id, 'view', '', '');
    RESET ROLE;
    IF NOT (v_result->>'allowed')::BOOLEAN THEN
      RAISE EXCEPTION 'B-6 FAILED: %', v_result;
    END IF;
    RAISE NOTICE 'B-6 PASSED: parent reading shared doc ALLOW';
  ELSE
    RAISE NOTICE 'B-6 SKIPPED: no parent profile found for email % (invite not yet accepted)', v_parent_email;
  END IF;

  -- B-7  parent reading active (school-internal) doc  → DENY parent_not_visible_state
  IF v_parent_profile_id IS NOT NULL THEN
    UPDATE child_documents SET status = 'active' WHERE id = v_doc_id;
    EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
      jsonb_build_object('sub', v_parent_profile_id::text, 'email', v_parent_email)::text);
    SET LOCAL ROLE authenticated;
    v_result := log_document_access(v_doc_id, 'view', '', '');
    RESET ROLE;
    IF (v_result->>'allowed')::BOOLEAN OR v_result->>'denied_reason' <> 'parent_not_visible_state' THEN
      RAISE EXCEPTION 'B-7 FAILED: %', v_result;
    END IF;
    RAISE NOTICE 'B-7 PASSED: parent on active doc DENY (parent_not_visible_state)';
    -- restore shared
    UPDATE child_documents SET status = 'shared' WHERE id = v_doc_id;
  ELSE
    RAISE NOTICE 'B-7 SKIPPED: no parent profile found';
  END IF;

  -- B-8  parent reading other-family doc  → DENY no_path
  IF v_other_parent_profile_id IS NOT NULL THEN
    EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
      jsonb_build_object('sub', v_other_parent_profile_id::text, 'email', v_other_parent_email)::text);
    SET LOCAL ROLE authenticated;
    v_result := log_document_access(v_doc_id, 'view', '', '');
    RESET ROLE;
    IF (v_result->>'allowed')::BOOLEAN OR v_result->>'denied_reason' <> 'no_path' THEN
      RAISE EXCEPTION 'B-8 FAILED: %', v_result;
    END IF;
    RAISE NOTICE 'B-8 PASSED: other-family parent DENY (no_path)';
  ELSE
    RAISE NOTICE 'B-8 SKIPPED: no second parent profile available (need a parent profile for a different family)';
  END IF;

  -- B-10  external_contact with active grant + granted consent  → ALLOW
  -- Omit 'sub' from JWT: external_contacts have no profiles row, and in v1
  -- their auth.users id is informational only. The decision tree resolves
  -- the actor through external_contact_ids_for_caller() (email match).
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('email', v_extc_email)::text);
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '8.8.8.8', 'curl/8');
  RESET ROLE;
  IF NOT (v_result->>'allowed')::BOOLEAN THEN
    RAISE EXCEPTION 'B-10 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-10 PASSED: external_contact view ALLOW';

  -- B-11  external_contact after consent revocation cascade  → DENY no_active_grant
  --
  -- The revoke must run under a context the parent-transition guard recognizes.
  -- Reason: SET LOCAL "request.jwt.claims" persists across RESET ROLE, so if
  -- we tried the UPDATE at "script level" the guard would still see the
  -- previous test's external_contact JWT, fail to early-return on the
  -- NULL-role path, and reject as if a parent were violating transition rules.
  -- We impersonate v_admin_id (current_user_role()='school_admin') so the
  -- guard early-returns cleanly. The cascade trigger 5.H fires regardless.
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin-test@example.com')::text);
  SET LOCAL ROLE authenticated;
  UPDATE document_consents
    SET status = 'revoked',
        revoked_at = NOW(),
        revoked_by_guardian_id = v_guardian_a,
        revoke_reason = 'TEST 056 revoke'
    WHERE id = v_consent_id;
  RESET ROLE;

  -- Now check that the external_contact's view is denied.
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('email', v_extc_email)::text);
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '', '');
  RESET ROLE;
  IF (v_result->>'allowed')::BOOLEAN OR v_result->>'denied_reason' <> 'no_active_grant' THEN
    RAISE EXCEPTION 'B-11 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-11 PASSED: external_contact after consent revoke DENY (no_active_grant)';

  -- B-12  external_contact attempts download where permissions.download = false
  -- Need to create a fresh granted consent + grant for this test
  DECLARE
    v_consent2 UUID;
    v_grant2   UUID;
  BEGIN
    INSERT INTO document_consents (
      school_id, student_id, granted_by_guardian_id, purpose,
      scope, recipients, allow_download, allow_reshare,
      status, expires_at, granted_at, requested_by_user_id
    ) VALUES (
      v_school_id, v_student_a_id, v_guardian_a, 'TEST 056 second consent',
      jsonb_build_object('type','document','document_id', v_doc_id::text),
      jsonb_build_array(jsonb_build_object('type','external_contact','external_contact_id', v_extc_id::text)),
      FALSE, FALSE,
      'granted', NOW() + INTERVAL '15 days', NOW(), v_admin_id
    ) RETURNING id INTO v_consent2;

    INSERT INTO document_access_grants (
      document_id, school_id, consent_id,
      grantee_kind, grantee_external_contact_id,
      permissions, expires_at, created_by
    ) VALUES (
      v_doc_id, v_school_id, v_consent2,
      'external_contact', v_extc_id,
      '{"view":true,"download":false,"comment":false,"upload_new_version":false}'::jsonb,
      NOW() + INTERVAL '10 days', v_admin_id
    ) RETURNING id INTO v_grant2;

    EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
      jsonb_build_object('email', v_extc_email)::text);
    SET LOCAL ROLE authenticated;
    v_result := log_document_access(v_doc_id, 'view', '', '');
    IF NOT (v_result->>'allowed')::BOOLEAN THEN
      RESET ROLE;
      RAISE EXCEPTION 'B-12 view leg FAILED: %', v_result;
    END IF;
    v_result := log_document_access(v_doc_id, 'download', '', '');
    RESET ROLE;
    IF (v_result->>'allowed')::BOOLEAN OR v_result->>'denied_reason' <> 'download_not_permitted' THEN
      RAISE EXCEPTION 'B-12 download leg FAILED: %', v_result;
    END IF;
    RAISE NOTICE 'B-12 PASSED: external_contact view ALLOW + download DENY (download_not_permitted)';
  END;

  -- B-15  unauthenticated → DENY unauthenticated
  -- Set JWT claims to empty (no sub, no email)
  SET LOCAL "request.jwt.claims" = '{}';
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '', '');
  RESET ROLE;
  IF (v_result->>'allowed')::BOOLEAN OR v_result->>'denied_reason' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'B-15 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-15 PASSED: no-JWT DENY (unauthenticated)';

  -- B-19  no_visible_version → DENY
  -- Move doc to draft and null out current_version_id
  UPDATE child_documents SET status = 'draft', current_version_id = NULL WHERE id = v_doc_id;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin-test@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_result := log_document_access(v_doc_id, 'view', '', '');
  RESET ROLE;
  IF (v_result->>'allowed')::BOOLEAN OR v_result->>'denied_reason' <> 'no_visible_version' THEN
    RAISE EXCEPTION 'B-19 FAILED: %', v_result;
  END IF;
  RAISE NOTICE 'B-19 PASSED: draft with NULL current_version_id DENY (no_visible_version)';

  ----------------------------------------------------------------
  -- Verify document_access_events captured the audit trail
  ----------------------------------------------------------------
  SELECT COUNT(*) INTO v_event_count
    FROM document_access_events
    WHERE document_id = v_doc_id;

  IF v_event_count < 8 THEN
    RAISE EXCEPTION 'Audit FAILED: expected at least 8 events, saw %', v_event_count;
  END IF;
  RAISE NOTICE 'Audit OK: % events captured for the test doc', v_event_count;

  RAISE NOTICE 'ALL PHASE B SCENARIOS PASSED.';
END $$;

ROLLBACK;
-- Change to COMMIT only if you want the audit rows + test fixtures persisted
-- for inspection. Default ROLLBACK keeps the database clean.

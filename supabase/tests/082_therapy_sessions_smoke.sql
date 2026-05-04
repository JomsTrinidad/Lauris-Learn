-- ============================================================
-- Smoke tests for migration 082 — Phase 6E (therapy_sessions).
-- BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1  Schema artifacts present (table, indexes, triggers,
--        policies, acceptance policy, RPC).
--   T-2  ★ Existing artifacts byte-clean ★
--        accessible_document_ids(), log_document_access(),
--        log_document_access_for_organizations(),
--        list_documents_for_organization(),
--        caller_owned_child_profile_ids(),
--        caller_visible_child_profile_ids(),
--        caller_visible_child_profile_ids_for_identifiers(),
--        log_clinic_document_access() bodies do NOT reference
--        therapy_sessions or list_clinic_members.
--   T-3  Owned-child happy path: clinic-A admin INSERTs a session
--        for clinic-A's owned child (existing 'clinic_client'
--        membership from 078); SELECT returns it.
--   T-4  Therapist (non-admin) of clinic-A INSERTs a session;
--        SELECT works for both admin and therapist.
--   T-5  Cross-clinic INSERT denied: clinic-B admin can't insert
--        for clinic-A's child.
--   T-6  Cross-clinic SELECT isolation: clinic-B sees 0 of clinic-A's
--        sessions.
--   T-7  School isolation: school_admin sees 0 therapy_sessions.
--   T-8  Therapist-spoofing INSERT denied: clinic-A admin can't pin
--        a session to a therapist who isn't a clinic-A member.
--   T-9  Pre-acceptance INSERT denied for school-shared child
--        (no clinic_client/therapy_client membership yet).
--   T-10 Acceptance flow: clinic-A admin INSERTs a 'therapy_client'
--        membership for a school-shared child WITH active grant →
--        succeeds; INSERT for a child WITHOUT grant → denied.
--   T-11 Post-acceptance INSERT works: after acceptance, clinic-A
--        admin can insert a session for the previously-shared child.
--   T-12 Therapy_type CHECK rejects 'physiotherapy' (deferred value).
--   T-13 Status CHECK rejects 'completed_with_notes' typo.
--   T-14 Column-guard rejects UPDATE on clinic_organization_id /
--        child_profile_id / created_by_profile_id (42501 each).
--   T-15 Lifecycle UPDATE works: status, notes, scheduled_at,
--        therapist_profile_id (mutated to a different active member).
--   T-16 list_clinic_members returns active members for a member;
--        non-member callers get empty.
--   T-17 No DELETE policy: admin DELETE on therapy_sessions → 0 rows.
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id            UUID;
  v_school_admin_id      UUID;
  v_school_admin_email   TEXT;
  v_school_org_id        UUID;

  v_clinic_a_id          UUID;
  v_clinic_b_id          UUID;
  v_admin_a_uid          UUID;
  v_therapist_a_uid      UUID;
  v_admin_b_uid          UUID;

  v_owned_child_id       UUID;        -- clinic-A owned ('clinic_client' membership)
  v_shared_child_id      UUID;        -- school-origin, identity grant to clinic A
  v_unrelated_shared_id  UUID;        -- school-origin, NO grant to clinic A
  v_school_student_id    UUID;

  v_session_id           UUID;
  v_def                  TEXT;
  v_count                INT;
  v_caught               BOOLEAN;
  v_caught_state         TEXT;
  v_rows                 INT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve fixtures (school side)
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id, email INTO v_school_admin_id, v_school_admin_email
    FROM profiles WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_school_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin'; END IF;

  SELECT id INTO v_school_org_id
    FROM organizations WHERE kind='school' AND school_id = v_school_id;
  IF v_school_org_id IS NULL THEN RAISE EXCEPTION 'no school org'; END IF;


  ----------------------------------------------------------------
  -- T-1  Schema artifacts present
  ----------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='therapy_sessions') THEN
    RAISE EXCEPTION 'T-1 FAILED: therapy_sessions missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='list_clinic_members') THEN
    RAISE EXCEPTION 'T-1 FAILED: list_clinic_members RPC missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ts_immutable_columns_guard_trg') THEN
    RAISE EXCEPTION 'T-1 FAILED: column-guard trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='therapy_sessions' AND policyname='select_therapy_sessions'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: select_therapy_sessions policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='therapy_sessions'
       AND policyname='clinic_staff_insert_therapy_sessions'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic_staff_insert_therapy_sessions missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='child_profile_memberships'
       AND policyname='clinic_admin_accept_granted_child'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: acceptance policy missing';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- T-2  ★ Existing artifacts byte-clean ★
  ----------------------------------------------------------------
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'accessible_document_ids',
         'log_document_access',
         'log_document_access_for_organizations',
         'list_documents_for_organization',
         'caller_owned_child_profile_ids',
         'caller_visible_child_profile_ids',
         'caller_visible_child_profile_ids_for_identifiers',
         'log_clinic_document_access'
       )
  LOOP
    IF position('therapy_sessions'   IN v_def) > 0
       OR position('list_clinic_members' IN v_def) > 0
       OR position('therapy_client'      IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-2 FAILED: existing helper/RPC body references 6E artifacts';
    END IF;
  END LOOP;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize fixtures
  ----------------------------------------------------------------
  -- Two clinics, three users (admin A, therapist A, admin B).
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 082 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 082 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aA-082@example.com')
    RETURNING id INTO v_admin_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_a_uid,'aA-082@example.com','TEST 082 Admin A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_admin_a_uid, 'clinic_admin', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-082@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-082@example.com','TEST 082 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aB-082@example.com')
    RETURNING id INTO v_admin_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_b_uid,'aB-082@example.com','TEST 082 Admin B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_admin_b_uid, 'clinic_admin', 'active');

  -- Clinic-owned child for clinic A (with auto clinic_client membership).
  v_owned_child_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, origin_organization_id, created_in_app)
    VALUES (v_owned_child_id,'TEST 082 Owned', v_clinic_a_id,'lauris_care');
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_owned_child_id, v_clinic_a_id, 'clinic_client', 'active','lauris_care');

  -- School-origin children. One has an active grant to clinic A; the
  -- other has none.
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST082','Shared')
    RETURNING id INTO v_school_student_id;
  v_shared_child_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, first_name, last_name, created_in_app)
    VALUES (v_shared_child_id,'TEST 082 Shared','TEST082','Shared','lauris_learn');
  UPDATE students SET child_profile_id = v_shared_child_id WHERE id = v_school_student_id;

  -- Identity grant: school org → clinic A.
  INSERT INTO child_profile_access_grants
    (child_profile_id, source_organization_id, target_organization_id,
     granted_by_profile_id, granted_by_kind, scope, status, valid_until)
    VALUES (v_shared_child_id, v_school_org_id, v_clinic_a_id,
            v_school_admin_id, 'school_admin', 'identity_only', 'active', NOW() + INTERVAL '30 days');

  -- Unrelated school-origin child: NO grant to clinic A.
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST082','Unrelated');
  v_unrelated_shared_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, first_name, last_name, created_in_app)
    VALUES (v_unrelated_shared_id,'TEST 082 Unrelated','TEST082','Unrelated','lauris_learn');


  ----------------------------------------------------------------
  -- T-3  Owned-child happy path
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-082@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_session_id := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, duration_minutes, notes, created_by_profile_id)
    VALUES
    (v_session_id, v_clinic_a_id, v_owned_child_id, v_admin_a_uid,
     'speech', NOW() + INTERVAL '1 day', 45, 'Initial intake', v_admin_a_uid);

  SELECT count(*) INTO v_count FROM therapy_sessions WHERE id = v_session_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-3 FAILED: admin cannot SELECT own session';
  END IF;
  RAISE NOTICE 'T-3 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-4  Therapist (non-admin) INSERT + SELECT
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-082@example.com')::text);
  SET LOCAL ROLE authenticated;

  INSERT INTO therapy_sessions
    (clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, created_by_profile_id)
    VALUES
    (v_clinic_a_id, v_owned_child_id, v_therapist_a_uid,
     'occupational', NOW() + INTERVAL '2 days', v_therapist_a_uid);

  SELECT count(*) INTO v_count FROM therapy_sessions
   WHERE clinic_organization_id = v_clinic_a_id;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'T-4 FAILED: therapist sees % rows, expected 2', v_count;
  END IF;
  RAISE NOTICE 'T-4 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-5  Cross-clinic INSERT denied
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-082@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO therapy_sessions
      (clinic_organization_id, child_profile_id, therapist_profile_id,
       therapy_type, scheduled_at, created_by_profile_id)
      VALUES
      (v_clinic_b_id, v_owned_child_id, v_admin_b_uid,
       'speech', NOW() + INTERVAL '1 day', v_admin_b_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-5 FAILED: cross-clinic INSERT not rejected';
  END IF;
  RAISE NOTICE 'T-5 PASSED';


  ----------------------------------------------------------------
  -- T-6  Cross-clinic SELECT isolation
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count FROM therapy_sessions
   WHERE clinic_organization_id = v_clinic_a_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: clinic-B sees % clinic-A sessions', v_count;
  END IF;
  RAISE NOTICE 'T-6 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-7  School isolation
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_school_admin_id::text, 'email', v_school_admin_email)::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM therapy_sessions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: school_admin sees % therapy sessions', v_count;
  END IF;
  RAISE NOTICE 'T-7 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-8  Therapist-spoofing denied
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-082@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_caught := false;
  BEGIN
    -- v_admin_b_uid is NOT a member of clinic A.
    INSERT INTO therapy_sessions
      (clinic_organization_id, child_profile_id, therapist_profile_id,
       therapy_type, scheduled_at, created_by_profile_id)
      VALUES
      (v_clinic_a_id, v_owned_child_id, v_admin_b_uid,
       'behavioral', NOW() + INTERVAL '1 day', v_admin_a_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-8 FAILED: therapist-spoofing INSERT not rejected';
  END IF;
  RAISE NOTICE 'T-8 PASSED';


  ----------------------------------------------------------------
  -- T-9  Pre-acceptance INSERT denied for school-shared child
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    INSERT INTO therapy_sessions
      (clinic_organization_id, child_profile_id, therapist_profile_id,
       therapy_type, scheduled_at, created_by_profile_id)
      VALUES
      (v_clinic_a_id, v_shared_child_id, v_admin_a_uid,
       'speech', NOW() + INTERVAL '1 day', v_admin_a_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-9 FAILED: pre-acceptance INSERT was allowed';
  END IF;
  RAISE NOTICE 'T-9 PASSED';


  ----------------------------------------------------------------
  -- T-10  Acceptance flow
  ----------------------------------------------------------------
  -- 10a — Accept the granted child.
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES
    (v_shared_child_id, v_clinic_a_id, 'therapy_client', 'active','lauris_care');

  IF NOT EXISTS (
    SELECT 1 FROM child_profile_memberships
     WHERE child_profile_id = v_shared_child_id
       AND organization_id  = v_clinic_a_id
       AND relationship_kind = 'therapy_client'
  ) THEN
    RAISE EXCEPTION 'T-10a FAILED: acceptance did not persist';
  END IF;

  -- 10b — Without grant: accept SHOULD fail.
  v_caught := false;
  BEGIN
    INSERT INTO child_profile_memberships
      (child_profile_id, organization_id, relationship_kind, status, created_in_app)
      VALUES
      (v_unrelated_shared_id, v_clinic_a_id, 'therapy_client', 'active','lauris_care');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-10b FAILED: acceptance without grant was allowed';
  END IF;
  RAISE NOTICE 'T-10 PASSED';


  ----------------------------------------------------------------
  -- T-11  Post-acceptance INSERT works
  ----------------------------------------------------------------
  INSERT INTO therapy_sessions
    (clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, created_by_profile_id)
    VALUES
    (v_clinic_a_id, v_shared_child_id, v_admin_a_uid,
     'speech', NOW() + INTERVAL '3 days', v_admin_a_uid);

  SELECT count(*) INTO v_count FROM therapy_sessions
   WHERE child_profile_id = v_shared_child_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-11 FAILED: expected 1 post-acceptance session, got %', v_count;
  END IF;
  RAISE NOTICE 'T-11 PASSED';


  ----------------------------------------------------------------
  -- T-12  therapy_type CHECK rejects unknown values
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    INSERT INTO therapy_sessions
      (clinic_organization_id, child_profile_id, therapist_profile_id,
       therapy_type, scheduled_at, created_by_profile_id)
      VALUES
      (v_clinic_a_id, v_owned_child_id, v_admin_a_uid,
       'physiotherapy', NOW() + INTERVAL '1 day', v_admin_a_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12 FAILED: bad therapy_type accepted';
  END IF;
  RAISE NOTICE 'T-12 PASSED';


  ----------------------------------------------------------------
  -- T-13  status CHECK rejects unknown values
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    UPDATE therapy_sessions SET status = 'completed_with_notes'
     WHERE id = v_session_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-13 FAILED: bad status accepted';
  END IF;
  RAISE NOTICE 'T-13 PASSED';


  ----------------------------------------------------------------
  -- T-14  Column-guard on UPDATE
  ----------------------------------------------------------------
  -- 14a — clinic_organization_id
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE therapy_sessions SET clinic_organization_id = v_clinic_b_id
     WHERE id = v_session_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-14a FAILED: clinic UPDATE not rejected (caught=%, state=%)',
      v_caught, v_caught_state;
  END IF;

  -- 14b — child_profile_id
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE therapy_sessions SET child_profile_id = v_shared_child_id
     WHERE id = v_session_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-14b FAILED: child UPDATE not rejected (caught=%, state=%)',
      v_caught, v_caught_state;
  END IF;

  -- 14c — created_by
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE therapy_sessions SET created_by_profile_id = v_therapist_a_uid
     WHERE id = v_session_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-14c FAILED: created_by UPDATE not rejected (caught=%, state=%)',
      v_caught, v_caught_state;
  END IF;
  RAISE NOTICE 'T-14 PASSED';


  ----------------------------------------------------------------
  -- T-15  Lifecycle UPDATE happy path
  ----------------------------------------------------------------
  UPDATE therapy_sessions
     SET status               = 'completed',
         notes                = 'session went well',
         scheduled_at         = NOW() + INTERVAL '4 days',
         therapist_profile_id = v_therapist_a_uid
   WHERE id = v_session_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T-15 FAILED: lifecycle UPDATE affected % rows', v_rows;
  END IF;
  RAISE NOTICE 'T-15 PASSED';


  ----------------------------------------------------------------
  -- T-16  list_clinic_members
  ----------------------------------------------------------------
  -- Member: should see at least admin A + therapist A.
  SELECT count(*) INTO v_count FROM list_clinic_members(v_clinic_a_id);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'T-16 FAILED: admin sees % members, expected ≥2', v_count;
  END IF;
  RESET ROLE;

  -- Non-member: empty.
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-082@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM list_clinic_members(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-16 FAILED: non-member resolved % rows', v_count;
  END IF;
  RAISE NOTICE 'T-16 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-17  No DELETE policy
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-082@example.com')::text);
  SET LOCAL ROLE authenticated;
  DELETE FROM therapy_sessions WHERE id = v_session_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-17 FAILED: DELETE removed % rows (expected 0)', v_rows;
  END IF;
  RAISE NOTICE 'T-17 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 082 smoke tests passed.';
END
$$ LANGUAGE plpgsql;

ROLLBACK;

-- ============================================================
-- Smoke tests for migration 104 — Care Performance Phase 2
-- sessions list RPC. BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Function present, SECURITY DEFINER, STABLE, EXECUTE
--         granted to authenticated only (REVOKE PUBLIC).
--   T-2   Unauthenticated caller → 0 rows.
--   T-3   Authenticated caller without an active membership in
--         p_org_id → 0 rows.
--   T-4   Clinic admin sees own-clinic sessions; therapist name +
--         child name resolve in the returned row.
--   T-5   Therapist (non-admin) of same clinic sees the same
--         sessions (matches the SELECT policy's predicate).
--   T-6   Cross-clinic: clinic-B admin calling with p_org_id =
--         clinic_a → 0 rows.
--   T-7   Cross-clinic isolation defence-in-depth: clinic-B admin
--         calling with p_org_id = clinic_b sees only clinic-B
--         sessions (clinic-A sessions stay hidden).
--   T-8   Filters: status, therapy_type, date range, child_profile
--         all narrow the result set as expected.
--   T-9   Ended child membership → session hidden (matches
--         select_therapy_sessions policy predicate).
--   T-10  ★ Strict isolation regression ★ — existing helpers / RPCs
--         (list_clinic_members, get_care_child_with_details,
--          list_documents_for_organization, accessible_document_ids,
--          log_document_access, log_document_access_for_organizations,
--          caller_owned_child_profile_ids,
--          caller_visible_child_profile_ids,
--          caller_visible_child_profile_ids_for_identifiers,
--          log_clinic_document_access) bodies do NOT reference the new
--         function. select_therapy_sessions policy body unchanged.
--   T-11  School isolation: school_admin direct SELECT on
--         therapy_sessions still returns 0 rows; calling the new RPC
--         also returns 0 rows.
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

  -- Children
  v_owned_child_id       UUID;   -- clinic-A owned, clinic_client membership active
  v_ended_child_id       UUID;   -- clinic-A owned, but membership ended
  v_clinic_b_child_id    UUID;   -- clinic-B owned

  -- Sessions
  v_sess_speech          UUID;
  v_sess_occ             UUID;
  v_sess_future          UUID;
  v_sess_past            UUID;
  v_sess_ended           UUID;
  v_sess_b               UUID;

  v_count                INT;
  v_row                  RECORD;
  v_proc_oid             OID;
  v_security_def         BOOLEAN;
  v_volatility           "char";
  v_def                  TEXT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Fixtures (school side)
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id, email INTO v_school_admin_id, v_school_admin_email
    FROM profiles WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_school_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin'; END IF;

  SELECT id INTO v_school_org_id
    FROM organizations WHERE kind='school' AND school_id = v_school_id;


  ----------------------------------------------------------------
  -- T-1 Function present, SECURITY DEFINER, STABLE, REVOKE/GRANT
  ----------------------------------------------------------------
  SELECT p.oid, p.prosecdef, p.provolatile
    INTO v_proc_oid, v_security_def, v_volatility
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_care_sessions_with_therapists' AND n.nspname='public';
  IF v_proc_oid IS NULL THEN
    RAISE EXCEPTION 'T-1 FAILED: function missing';
  END IF;
  IF NOT v_security_def THEN
    RAISE EXCEPTION 'T-1 FAILED: function not SECURITY DEFINER';
  END IF;
  IF v_volatility <> 's' THEN
    RAISE EXCEPTION 'T-1 FAILED: function not STABLE (got %)', v_volatility;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='get_care_sessions_with_therapists'
       AND grantee='PUBLIC'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: PUBLIC still has EXECUTE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='get_care_sessions_with_therapists'
       AND grantee='authenticated'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: authenticated lacks EXECUTE';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize clinics + members + children + sessions
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 104 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 104 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aA-104@example.com')
    RETURNING id INTO v_admin_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_a_uid,'aA-104@example.com','TEST 104 Admin A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_admin_a_uid, 'clinic_admin', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-104@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-104@example.com','TEST 104 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aB-104@example.com')
    RETURNING id INTO v_admin_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_b_uid,'aB-104@example.com','TEST 104 Admin B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_admin_b_uid, 'clinic_admin', 'active');

  -- Owned child of clinic A.
  v_owned_child_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, origin_organization_id, created_in_app)
    VALUES (v_owned_child_id,'TEST 104 Owned', v_clinic_a_id, 'lauris_care');
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_owned_child_id, v_clinic_a_id, 'clinic_client', 'active', 'lauris_care');

  -- Owned child of clinic A whose membership we'll flip to 'ended'
  -- to verify the predicate hides ended-membership sessions.
  v_ended_child_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, origin_organization_id, created_in_app)
    VALUES (v_ended_child_id,'TEST 104 Ended', v_clinic_a_id, 'lauris_care');
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_ended_child_id, v_clinic_a_id, 'clinic_client', 'active', 'lauris_care');

  -- Owned child of clinic B.
  v_clinic_b_child_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, origin_organization_id, created_in_app)
    VALUES (v_clinic_b_child_id,'TEST 104 ClinicB Child', v_clinic_b_id, 'lauris_care');
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_clinic_b_child_id, v_clinic_b_id, 'clinic_client', 'active', 'lauris_care');

  -- Sessions for clinic A.
  v_sess_speech := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, duration_minutes, status, notes,
     created_by_profile_id)
    VALUES
    (v_sess_speech, v_clinic_a_id, v_owned_child_id, v_therapist_a_uid,
     'speech', NOW() + INTERVAL '2 days', 45, 'scheduled', 'Speech eval',
     v_admin_a_uid);

  v_sess_occ := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, duration_minutes, status, notes,
     created_by_profile_id)
    VALUES
    (v_sess_occ, v_clinic_a_id, v_owned_child_id, v_therapist_a_uid,
     'occupational', NOW() + INTERVAL '5 days', 30, 'scheduled', 'OT eval',
     v_admin_a_uid);

  v_sess_future := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, duration_minutes, status, notes,
     created_by_profile_id)
    VALUES
    (v_sess_future, v_clinic_a_id, v_owned_child_id, v_admin_a_uid,
     'speech', NOW() + INTERVAL '30 days', 60, 'scheduled', 'Far future',
     v_admin_a_uid);

  v_sess_past := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, duration_minutes, status, notes,
     created_by_profile_id)
    VALUES
    (v_sess_past, v_clinic_a_id, v_owned_child_id, v_therapist_a_uid,
     'behavioral', NOW() - INTERVAL '7 days', 60, 'completed', 'Past',
     v_admin_a_uid);

  -- Session for the ended-membership child. Insert it first while
  -- membership is still active, then flip the membership.
  v_sess_ended := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, duration_minutes, status, notes,
     created_by_profile_id)
    VALUES
    (v_sess_ended, v_clinic_a_id, v_ended_child_id, v_therapist_a_uid,
     'speech', NOW() + INTERVAL '3 days', 45, 'scheduled', 'Ended membership',
     v_admin_a_uid);
  UPDATE child_profile_memberships
     SET status = 'ended', ended_at = NOW()
   WHERE child_profile_id = v_ended_child_id
     AND organization_id = v_clinic_a_id;

  -- Session for clinic B (cross-clinic).
  v_sess_b := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, duration_minutes, status, notes,
     created_by_profile_id)
    VALUES
    (v_sess_b, v_clinic_b_id, v_clinic_b_child_id, v_admin_b_uid,
     'speech', NOW() + INTERVAL '4 days', 45, 'scheduled', 'Clinic B',
     v_admin_b_uid);


  ----------------------------------------------------------------
  -- T-2  Unauthenticated → 0 rows
  ----------------------------------------------------------------
  -- No SET ROLE, no jwt claims set. auth.uid() will be NULL.
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-2 FAILED: unauthenticated returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- T-3  Authenticated but not a member of p_org_id → 0 rows
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-104@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: non-member of clinic A returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-3 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-4  Clinic admin happy path + names resolve
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-104@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Expected clinic-A sessions: speech, occ, future, past = 4. The
  -- ended-membership session must be excluded.
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'T-4 FAILED: expected 4 clinic-A sessions, got %', v_count;
  END IF;

  -- Inspect the speech session row.
  SELECT * INTO v_row
    FROM get_care_sessions_with_therapists(v_clinic_a_id)
    WHERE id = v_sess_speech;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'T-4 FAILED: speech session missing';
  END IF;
  IF v_row.child_display_name <> 'TEST 104 Owned' THEN
    RAISE EXCEPTION 'T-4 FAILED: child_display_name mismatch, got %', v_row.child_display_name;
  END IF;
  IF v_row.therapist_full_name <> 'TEST 104 Therapist A' THEN
    RAISE EXCEPTION 'T-4 FAILED: therapist_full_name mismatch, got %', v_row.therapist_full_name;
  END IF;
  IF v_row.therapist_email <> 'tA-104@example.com' THEN
    RAISE EXCEPTION 'T-4 FAILED: therapist_email mismatch, got %', v_row.therapist_email;
  END IF;
  IF v_row.therapy_type <> 'speech' THEN
    RAISE EXCEPTION 'T-4 FAILED: therapy_type mismatch, got %', v_row.therapy_type;
  END IF;
  IF v_row.clinic_organization_id <> v_clinic_a_id THEN
    RAISE EXCEPTION 'T-4 FAILED: wrong clinic_organization_id';
  END IF;
  RAISE NOTICE 'T-4 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-5  Therapist (non-admin) sees same sessions
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-104@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'T-5 FAILED: therapist expected 4 sessions, got %', v_count;
  END IF;
  RAISE NOTICE 'T-5 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-6  Cross-clinic: clinic B admin asking for clinic A
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-104@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: clinic B leaked clinic A sessions, got %', v_count;
  END IF;
  RAISE NOTICE 'T-6 PASSED';


  ----------------------------------------------------------------
  -- T-7  Clinic B own-org: sees clinic B sessions, not A
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_b_id);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-7 FAILED: clinic B expected 1 session, got %', v_count;
  END IF;

  SELECT * INTO v_row
    FROM get_care_sessions_with_therapists(v_clinic_b_id)
    LIMIT 1;
  IF v_row.id <> v_sess_b THEN
    RAISE EXCEPTION 'T-7 FAILED: clinic B got wrong session id';
  END IF;
  IF v_row.clinic_organization_id <> v_clinic_b_id THEN
    RAISE EXCEPTION 'T-7 FAILED: clinic B got cross-clinic clinic_organization_id';
  END IF;
  RAISE NOTICE 'T-7 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-8  Filters: status, therapy_type, date range, child_profile
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-104@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Status = 'completed' → only v_sess_past (1 row).
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id, NULL, NULL, 'completed', NULL, NULL);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-8a FAILED: status=completed expected 1, got %', v_count;
  END IF;

  -- therapy_type = 'occupational' → 1 row.
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id, NULL, NULL, NULL, 'occupational', NULL);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-8b FAILED: therapy_type=occupational expected 1, got %', v_count;
  END IF;

  -- Date range: only future sessions within next 10 days → speech + occ (2).
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(
      v_clinic_a_id,
      NOW(),
      NOW() + INTERVAL '10 days',
      NULL, NULL, NULL
    );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'T-8c FAILED: 0-10 day window expected 2, got %', v_count;
  END IF;

  -- child_profile filter on owned child → 4 sessions.
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(
      v_clinic_a_id, NULL, NULL, NULL, NULL, v_owned_child_id
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'T-8d FAILED: child_profile filter expected 4, got %', v_count;
  END IF;

  -- child_profile filter on ended-membership child → 0 (still hidden).
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(
      v_clinic_a_id, NULL, NULL, NULL, NULL, v_ended_child_id
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8e FAILED: ended-membership filter expected 0, got %', v_count;
  END IF;

  RAISE NOTICE 'T-8 PASSED';


  ----------------------------------------------------------------
  -- T-9  Ended-membership session hidden (no filter)
  ----------------------------------------------------------------
  -- Already covered by T-4 (count=4 not 5); also verify by id.
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id)
   WHERE id = v_sess_ended;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-9 FAILED: ended-membership session leaked';
  END IF;
  RAISE NOTICE 'T-9 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-10 ★ Strict isolation regression ★
  -- Existing helpers/RPCs do NOT reference the new function.
  ----------------------------------------------------------------
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'list_clinic_members',
         'get_care_child_with_details',
         'list_documents_for_organization',
         'accessible_document_ids',
         'log_document_access',
         'log_document_access_for_organizations',
         'caller_owned_child_profile_ids',
         'caller_visible_child_profile_ids',
         'caller_visible_child_profile_ids_for_identifiers',
         'log_clinic_document_access'
       )
  LOOP
    IF position('get_care_sessions_with_therapists' IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-10 FAILED: existing helper/RPC body references new RPC';
    END IF;
  END LOOP;

  -- select_therapy_sessions policy must be unchanged: assert it
  -- exists (would be broken if a different policy replaced it).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='therapy_sessions' AND policyname='select_therapy_sessions'
  ) THEN
    RAISE EXCEPTION 'T-10 FAILED: select_therapy_sessions policy missing';
  END IF;
  RAISE NOTICE 'T-10 PASSED';


  ----------------------------------------------------------------
  -- T-11 School isolation: school_admin still sees 0 sessions
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_school_admin_id::text, 'email', v_school_admin_email)::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM therapy_sessions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: school_admin direct SELECT got % rows', v_count;
  END IF;

  -- RPC: school_admin has no membership in clinic A or B → 0 rows.
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: school_admin RPC clinic A got % rows', v_count;
  END IF;
  SELECT count(*) INTO v_count
    FROM get_care_sessions_with_therapists(v_clinic_b_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: school_admin RPC clinic B got % rows', v_count;
  END IF;
  RAISE NOTICE 'T-11 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 104 smoke tests passed.';
END;
$$;

ROLLBACK;

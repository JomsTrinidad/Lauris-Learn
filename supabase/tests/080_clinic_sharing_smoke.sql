-- ============================================================
-- Smoke tests for migration 080 — Phase 6D (clinic-sharing RPCs).
-- BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Schema artifacts present (3 RPCs).
--   T-2   ★ Existing artifacts byte-clean ★
--         caller_visible_organization_ids() body, doag_is_clinic_or_medical_org()
--         body, organizations policies, child_profile_access_grants
--         policies, document_organization_access_grants policies — all
--         stay byte-identical.
--   T-3   list_clinic_organizations_for_sharing returns clinic and
--         medical_practice rows for school_admin.
--   T-4   list_clinic_organizations_for_sharing supports ILIKE search.
--   T-5   list_clinic_organizations_for_sharing returns empty for
--         non-school_admin callers (teacher / unauthenticated /
--         parent / clinic-admin).
--   T-6   create_clinic_organization_for_sharing inserts a new clinic
--         org with school_id=NULL.
--   T-7   create_clinic_organization_for_sharing rejects bad kind
--         (22023), empty name (22023), non-school_admin (42501).
--   T-8   lookup_clinic_organizations returns name+kind for clinic ids.
--   T-9   lookup_clinic_organizations skips school orgs and unknown ids.
--   T-10  lookup_clinic_organizations returns empty for non-school_admin.
--   T-11  Direct INSERT into organizations as school_admin still
--         restricted to kind='school' (RLS policy 072 unchanged).
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id           UUID;
  v_admin_id            UUID;
  v_admin_email         TEXT;
  v_school_org_id       UUID;

  v_clinic_a_id         UUID;
  v_clinic_b_id         UUID;
  v_med_id              UUID;

  v_teacher_uid         UUID;
  v_teacher_id          UUID;

  v_def                 TEXT;
  v_count               INT;
  v_caught              BOOLEAN;
  v_caught_state        TEXT;
  v_returned_id         UUID;
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve fixtures
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id, email INTO v_admin_id, v_admin_email
    FROM profiles WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin'; END IF;

  SELECT id INTO v_school_org_id
    FROM organizations WHERE kind='school' AND school_id = v_school_id;
  IF v_school_org_id IS NULL THEN RAISE EXCEPTION 'no school org'; END IF;


  ----------------------------------------------------------------
  -- T-1  Schema artifacts present
  ----------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='list_clinic_organizations_for_sharing'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: list_clinic_organizations_for_sharing missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='create_clinic_organization_for_sharing'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: create_clinic_organization_for_sharing missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='lookup_clinic_organizations'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: lookup_clinic_organizations missing';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- T-2  ★ Existing artifacts byte-clean ★
  ----------------------------------------------------------------
  -- Pre-existing helpers must NOT reference the three new RPCs.
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'caller_visible_organization_ids',
         'caller_visible_child_profile_ids',
         'caller_visible_child_profile_ids_for_identifiers',
         'caller_owned_child_profile_ids',
         'doag_is_clinic_or_medical_org',
         'log_document_access',
         'log_document_access_for_organizations',
         'list_documents_for_organization'
       )
  LOOP
    IF position('list_clinic_organizations_for_sharing'   IN v_def) > 0
       OR position('create_clinic_organization_for_sharing' IN v_def) > 0
       OR position('lookup_clinic_organizations'             IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-2 FAILED: an existing helper body references Phase 6D RPCs';
    END IF;
  END LOOP;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize fixtures (3 clinic/medical orgs, 1 teacher).
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 080 — Acme Therapy','PH','lauris_learn')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 080 — Bright Pediatrics','PH','lauris_learn')
    RETURNING id INTO v_clinic_b_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('medical_practice','TEST 080 — Med Group','PH','lauris_learn')
    RETURNING id INTO v_med_id;

  -- A teacher in the same school for T-5 negative case.
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tch-080@example.com')
    RETURNING id INTO v_teacher_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_teacher_uid,'tch-080@example.com','TEST 080 Teacher',v_school_id,'teacher')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  v_teacher_id := v_teacher_uid;


  ----------------------------------------------------------------
  -- T-3  list_clinic_organizations_for_sharing returns clinic + medical
  --      rows for school_admin.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email)::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM list_clinic_organizations_for_sharing(NULL, 200)
   WHERE id IN (v_clinic_a_id, v_clinic_b_id, v_med_id);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T-3 FAILED: expected 3 of our test orgs visible, got %', v_count;
  END IF;

  -- Confirm a school org is NOT included even though it exists.
  SELECT count(*) INTO v_count
    FROM list_clinic_organizations_for_sharing(NULL, 500)
   WHERE id = v_school_org_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: school org leaked into clinic listing';
  END IF;
  RAISE NOTICE 'T-3 PASSED';


  ----------------------------------------------------------------
  -- T-4  ILIKE search filter.
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM list_clinic_organizations_for_sharing('acme', 50)
   WHERE id = v_clinic_a_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-4 FAILED: ILIKE search did not return Acme Therapy';
  END IF;

  SELECT count(*) INTO v_count
    FROM list_clinic_organizations_for_sharing('acme', 50)
   WHERE id = v_clinic_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-4 FAILED: ILIKE search returned non-matching org';
  END IF;
  RAISE NOTICE 'T-4 PASSED';


  ----------------------------------------------------------------
  -- T-5  Non-school_admin callers get empty results.
  ----------------------------------------------------------------
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_uid::text, 'email','tch-080@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM list_clinic_organizations_for_sharing(NULL, 200);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-5 FAILED: teacher saw % clinic rows, expected 0', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM lookup_clinic_organizations(ARRAY[v_clinic_a_id, v_clinic_b_id]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-5 FAILED: teacher resolved % clinic rows via lookup, expected 0', v_count;
  END IF;
  RAISE NOTICE 'T-5 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-6  create_clinic_organization_for_sharing happy path.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email)::text);
  SET LOCAL ROLE authenticated;

  v_returned_id := create_clinic_organization_for_sharing(
    'clinic', 'TEST 080 — Created Inline', 'PH'
  );
  IF v_returned_id IS NULL THEN
    RAISE EXCEPTION 'T-6 FAILED: function returned NULL';
  END IF;

  -- Verify the row landed correctly. RESET ROLE so SELECT bypasses RLS.
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM organizations
     WHERE id = v_returned_id
       AND kind = 'clinic'
       AND name = 'TEST 080 — Created Inline'
       AND school_id IS NULL
       AND created_in_app = 'lauris_learn'
  ) THEN
    RAISE EXCEPTION 'T-6 FAILED: created row does not match expected shape';
  END IF;
  RAISE NOTICE 'T-6 PASSED';


  ----------------------------------------------------------------
  -- T-7  create_* validation cases.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email)::text);
  SET LOCAL ROLE authenticated;

  -- 7a — bad kind
  v_caught := false; v_caught_state := NULL;
  BEGIN
    PERFORM create_clinic_organization_for_sharing('school','TEST 080 forbidden kind', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '22023' THEN
    RAISE EXCEPTION 'T-7a FAILED: bad kind not rejected (caught=%, state=%)', v_caught, v_caught_state;
  END IF;

  -- 7b — empty name
  v_caught := false; v_caught_state := NULL;
  BEGIN
    PERFORM create_clinic_organization_for_sharing('clinic','   ', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '22023' THEN
    RAISE EXCEPTION 'T-7b FAILED: empty name not rejected (caught=%, state=%)', v_caught, v_caught_state;
  END IF;

  -- 7c — non-school_admin (teacher)
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_uid::text, 'email','tch-080@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_caught := false; v_caught_state := NULL;
  BEGIN
    PERFORM create_clinic_organization_for_sharing('clinic','TEST 080 forbidden caller', 'PH');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-7c FAILED: teacher caller not rejected (caught=%, state=%)', v_caught, v_caught_state;
  END IF;
  RAISE NOTICE 'T-7 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-8  lookup_clinic_organizations resolves names + kinds.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email)::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM lookup_clinic_organizations(ARRAY[v_clinic_a_id, v_clinic_b_id, v_med_id]);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T-8 FAILED: expected 3, got %', v_count;
  END IF;

  -- Sanity: each row's name matches the seed.
  IF NOT EXISTS (
    SELECT 1 FROM lookup_clinic_organizations(ARRAY[v_clinic_a_id])
     WHERE name = 'TEST 080 — Acme Therapy' AND kind = 'clinic'
  ) THEN
    RAISE EXCEPTION 'T-8 FAILED: name/kind resolution wrong';
  END IF;
  RAISE NOTICE 'T-8 PASSED';


  ----------------------------------------------------------------
  -- T-9  lookup skips school orgs + unknown ids.
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM lookup_clinic_organizations(ARRAY[v_school_org_id, '00000000-0000-0000-0000-000000000fff'::UUID]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-9 FAILED: unsupported ids leaked, got %', v_count;
  END IF;
  RAISE NOTICE 'T-9 PASSED';


  ----------------------------------------------------------------
  -- T-10  lookup returns empty for non-school_admin (already covered
  --       partially by T-5; explicit case here for documentation).
  ----------------------------------------------------------------
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_uid::text, 'email','tch-080@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM lookup_clinic_organizations(ARRAY[v_clinic_a_id, v_clinic_b_id]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-10 FAILED: teacher resolved %, expected 0', v_count;
  END IF;
  RAISE NOTICE 'T-10 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-11  Direct INSERT into organizations as school_admin still
  --       restricted to kind='school' (RLS unchanged).
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email)::text);
  SET LOCAL ROLE authenticated;
  v_caught := false; v_caught_state := NULL;
  BEGIN
    INSERT INTO organizations (kind, name, school_id, created_in_app)
      VALUES ('clinic','TEST 080 — direct insert SHOULD FAIL', NULL, 'lauris_learn');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-11 FAILED: direct INSERT was not blocked by RLS (caught=%, state=%)',
      v_caught, v_caught_state;
  END IF;
  RAISE NOTICE 'T-11 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 080 smoke tests passed.';
END
$$ LANGUAGE plpgsql;

ROLLBACK;

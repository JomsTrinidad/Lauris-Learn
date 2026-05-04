-- ============================================================
-- Smoke tests for migration 079 — Phase 6B.1 (clinic-admin edits).
-- BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Schema artifacts present (3 new policies + 2 new triggers
--         + 2 new trigger functions). Existing 6B artifacts intact.
--   T-2   ★ Existing helpers + 6B artifacts byte-clean ★
--         caller_visible_child_profile_ids() body, identifier helper
--         body, and caller_owned_child_profile_ids() body are NOT
--         modified by this migration.
--   T-3   Clinic admin can UPDATE display_name on own clinic-owned
--         child (happy path).
--   T-4   Clinic admin UPDATE on a different clinic's child silently
--         fails (RLS USING denies → 0 rows changed).
--   T-5   Clinic admin UPDATE on a school-shared child fails (no grant
--         arm in ownership helper → 0 rows changed).
--   T-6   Origin immutability still enforced (trigger 078.2.B fires).
--   T-7   Non-admin clinic member (therapist) UPDATE silently fails.
--   T-8   School_admin UPDATE on clinic-owned child fails (existing
--         school policy requires students linkage, none exists for
--         clinic-owned).
--   T-9   No-op UPDATE on clinic-owned child rejected with SQLSTATE
--         22000 (adjustment 1).
--   T-10  No-op UPDATE on school-origin child PASSES (guard scoped
--         to clinic-owned, school-side untouched).
--   T-11  Identifier UPDATE happy path (clinic admin updates an
--         identifier_value on own child).
--   T-12  Identifier UPDATE attempting to change child_profile_id is
--         rejected (adjustment 2 — trigger raises 42501).
--   T-13  Identifier UPDATE no-op rejected (22000).
--   T-14  Identifier DELETE happy path.
--   T-15  Identifier UPDATE on other clinic's identifier silently
--         fails (RLS USING denies → 0 rows).
--   T-16  Identifier unique-index collision still raises 23505 on
--         UPDATE (existing partial unique index still in force).
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id          UUID;
  v_admin_id           UUID;
  v_school_org_id      UUID;
  v_school_student_id  UUID;
  v_school_profile_id  UUID;

  v_clinic_a_id        UUID;
  v_clinic_b_id        UUID;
  v_admin_a_uid        UUID;
  v_therapist_a_uid    UUID;
  v_admin_b_uid        UUID;

  v_child_a_id         UUID;
  v_child_b_id         UUID;
  v_ident_a_id         UUID;
  v_ident_b_id         UUID;
  v_school_ident_id    UUID;

  v_def                TEXT;
  v_caught             BOOLEAN;
  v_caught_state       TEXT;
  v_rows               INT;
  v_origin             UUID;
  v_value              TEXT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve fixtures (school side)
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id INTO v_admin_id
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
    SELECT 1 FROM pg_policies
     WHERE tablename='child_profiles'
       AND policyname='clinic_admin_update_child_profiles'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic_admin_update_child_profiles missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='child_identifiers'
       AND policyname='clinic_admin_update_child_identifiers'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic_admin_update_child_identifiers missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='child_identifiers'
       AND policyname='clinic_admin_delete_child_identifiers'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic_admin_delete_child_identifiers missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='cp_clinic_owned_noop_guard') THEN
    RAISE EXCEPTION 'T-1 FAILED: cp_clinic_owned_noop_guard function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='ci_clinic_owned_update_guard') THEN
    RAISE EXCEPTION 'T-1 FAILED: ci_clinic_owned_update_guard function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='cp_clinic_owned_noop_guard_trigger') THEN
    RAISE EXCEPTION 'T-1 FAILED: cp_clinic_owned_noop_guard_trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ci_clinic_owned_update_guard_trigger') THEN
    RAISE EXCEPTION 'T-1 FAILED: ci_clinic_owned_update_guard_trigger missing';
  END IF;
  -- 6B artifacts still intact:
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='caller_owned_child_profile_ids') THEN
    RAISE EXCEPTION 'T-1 FAILED: 6B ownership helper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='cp_origin_immutable_guard_trigger') THEN
    RAISE EXCEPTION 'T-1 FAILED: 6B origin-immutable trigger missing';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- T-2  ★ Helpers byte-clean ★
  ----------------------------------------------------------------
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'caller_visible_child_profile_ids',
         'caller_visible_child_profile_ids_for_identifiers'
       )
  LOOP
    IF position('origin_organization_id' IN v_def) > 0
       OR position('caller_owned_child_profile_ids' IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-2 FAILED: identity helper body references 6B/6B.1 artifacts';
    END IF;
  END LOOP;
  -- Ownership helper itself must NOT have learned about 6B.1's
  -- triggers/policies (it should still be the simple membership query).
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE proname='caller_owned_child_profile_ids';
  IF position('cp_clinic_owned_noop_guard' IN v_def) > 0
     OR position('ci_clinic_owned_update_guard' IN v_def) > 0 THEN
    RAISE EXCEPTION 'T-2 FAILED: ownership helper body references 6B.1 trigger artifacts';
  END IF;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize fixtures (mirrors 078 layout)
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 079 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 079 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  -- Clinic A admin
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aA-079@example.com')
    RETURNING id INTO v_admin_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_a_uid,'aA-079@example.com','TEST 079 Admin A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_admin_a_uid, 'clinic_admin', 'active');

  -- Clinic A therapist (non-admin)
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-079@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-079@example.com','TEST 079 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');

  -- Clinic B admin
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aB-079@example.com')
    RETURNING id INTO v_admin_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_b_uid,'aB-079@example.com','TEST 079 Admin B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_admin_b_uid, 'clinic_admin', 'active');

  -- School-origin student + child_profile (used by T-5, T-8, T-10).
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST079','SchoolKid')
    RETURNING id INTO v_school_student_id;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST079 SchoolKid','TEST079','SchoolKid','lauris_learn')
    RETURNING id INTO v_school_profile_id;
  UPDATE students SET child_profile_id = v_school_profile_id WHERE id = v_school_student_id;
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_school_profile_id, 'lrn', 'LRN-079-SCHOOL', 'PH')
    RETURNING id INTO v_school_ident_id;

  -- Clinic A child + identifier (mint UUID; INSERT without RETURNING).
  v_child_a_id := gen_random_uuid();
  v_ident_a_id := gen_random_uuid();
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  INSERT INTO child_profiles (id, display_name, first_name, last_name, origin_organization_id, created_in_app)
    VALUES (v_child_a_id, 'TEST079 ClinicAKid', 'TEST079', 'ClinicAKid', v_clinic_a_id, 'lauris_care');
  INSERT INTO child_profile_memberships (child_profile_id, organization_id, relationship_kind, status, started_at, created_in_app)
    VALUES (v_child_a_id, v_clinic_a_id, 'clinic_client', 'active', NOW(), 'lauris_care');
  INSERT INTO child_identifiers (id, child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_ident_a_id, v_child_a_id, 'lrn', 'LRN-079-CLINIC-A', 'PH');
  RESET ROLE;

  -- Clinic B child + identifier
  v_child_b_id := gen_random_uuid();
  v_ident_b_id := gen_random_uuid();
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  INSERT INTO child_profiles (id, display_name, first_name, last_name, origin_organization_id, created_in_app)
    VALUES (v_child_b_id, 'TEST079 ClinicBKid', 'TEST079', 'ClinicBKid', v_clinic_b_id, 'lauris_care');
  INSERT INTO child_profile_memberships (child_profile_id, organization_id, relationship_kind, status, started_at, created_in_app)
    VALUES (v_child_b_id, v_clinic_b_id, 'clinic_client', 'active', NOW(), 'lauris_care');
  INSERT INTO child_identifiers (id, child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_ident_b_id, v_child_b_id, 'lrn', 'LRN-079-CLINIC-B', 'PH');
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-3  Clinic A admin UPDATEs own child's display_name
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;

  UPDATE child_profiles
     SET display_name = 'TEST079 ClinicAKid (renamed)'
   WHERE id = v_child_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T-3 FAILED: expected 1 row updated, got %', v_rows;
  END IF;
  IF (SELECT display_name FROM child_profiles WHERE id = v_child_a_id) <> 'TEST079 ClinicAKid (renamed)' THEN
    RAISE EXCEPTION 'T-3 FAILED: display_name not persisted';
  END IF;
  RAISE NOTICE 'T-3 PASSED';


  ----------------------------------------------------------------
  -- T-4  Clinic A admin attempts UPDATE on Clinic B's child.
  --      Silent denial (USING fails → 0 rows).
  ----------------------------------------------------------------
  UPDATE child_profiles
     SET display_name = 'FORGED'
   WHERE id = v_child_b_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-4 FAILED: cross-clinic UPDATE leaked, got % rows', v_rows;
  END IF;
  -- Verify B's row unchanged. RESET ROLE so we can SELECT it.
  RESET ROLE;
  IF (SELECT display_name FROM child_profiles WHERE id = v_child_b_id) <> 'TEST079 ClinicBKid' THEN
    RAISE EXCEPTION 'T-4 FAILED: clinic B child silently mutated';
  END IF;
  RAISE NOTICE 'T-4 PASSED';


  ----------------------------------------------------------------
  -- T-5  Clinic A admin attempts UPDATE on a school-shared child.
  --      No ownership match → 0 rows.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  UPDATE child_profiles
     SET display_name = 'FORGED'
   WHERE id = v_school_profile_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-5 FAILED: school-origin UPDATE leaked, got % rows', v_rows;
  END IF;
  RESET ROLE;
  IF (SELECT display_name FROM child_profiles WHERE id = v_school_profile_id) <> 'TEST079 SchoolKid' THEN
    RAISE EXCEPTION 'T-5 FAILED: school child silently mutated';
  END IF;
  RAISE NOTICE 'T-5 PASSED';


  ----------------------------------------------------------------
  -- T-6  Origin still immutable (trigger 078.2.B fires for non-super).
  --      As clinic A admin via UI policy: USING passes (own child),
  --      but the immutability trigger raises 42501 either way.
  --      Run as postgres bypassing RLS to see the trigger surface.
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    UPDATE child_profiles
       SET origin_organization_id = v_clinic_b_id
     WHERE id = v_child_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-6 FAILED: origin-immutability trigger did not fire';
  END IF;
  IF (SELECT origin_organization_id FROM child_profiles WHERE id = v_child_a_id) <> v_clinic_a_id THEN
    RAISE EXCEPTION 'T-6 FAILED: origin actually changed despite trigger raise';
  END IF;
  RAISE NOTICE 'T-6 PASSED';


  ----------------------------------------------------------------
  -- T-7  Non-admin clinic member (therapist) UPDATE silently fails.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  UPDATE child_profiles
     SET display_name = 'FORGED-by-therapist'
   WHERE id = v_child_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: therapist UPDATE leaked, got % rows', v_rows;
  END IF;
  RESET ROLE;
  IF (SELECT display_name FROM child_profiles WHERE id = v_child_a_id) <> 'TEST079 ClinicAKid (renamed)' THEN
    RAISE EXCEPTION 'T-7 FAILED: therapist silently mutated own clinic''s child';
  END IF;
  RAISE NOTICE 'T-7 PASSED';


  ----------------------------------------------------------------
  -- T-8  School_admin UPDATE on clinic-owned child → 0 rows.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email',(SELECT email FROM profiles WHERE id=v_admin_id))::text);
  SET LOCAL ROLE authenticated;
  UPDATE child_profiles
     SET display_name = 'FORGED-by-school'
   WHERE id = v_child_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: school_admin reached clinic-owned, got % rows', v_rows;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'T-8 PASSED';


  ----------------------------------------------------------------
  -- T-9  No-op UPDATE on clinic-owned rejected with SQLSTATE 22000.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_caught := false;
  v_caught_state := NULL;
  BEGIN
    -- Set every editable column back to its current value.
    UPDATE child_profiles
       SET display_name      = display_name,
           legal_name        = legal_name,
           first_name        = first_name,
           middle_name       = middle_name,
           last_name         = last_name,
           preferred_name    = preferred_name,
           date_of_birth     = date_of_birth,
           sex_at_birth      = sex_at_birth,
           gender_identity   = gender_identity,
           primary_language  = primary_language,
           country_code      = country_code
     WHERE id = v_child_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught       := true;
    v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-9 FAILED: no-op UPDATE was not rejected';
  END IF;
  IF v_caught_state <> '22000' THEN
    RAISE EXCEPTION 'T-9 FAILED: expected SQLSTATE 22000, got %', v_caught_state;
  END IF;
  RAISE NOTICE 'T-9 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-10  No-op on school-origin profile PASSES (guard scoped to
  --       clinic-owned). School-side behaviour byte-clean.
  ----------------------------------------------------------------
  -- Run as postgres (RLS bypassed) so we exercise the trigger only.
  UPDATE child_profiles
     SET display_name = display_name
   WHERE id = v_school_profile_id;
  -- Should NOT raise.
  RAISE NOTICE 'T-10 PASSED';


  ----------------------------------------------------------------
  -- T-11  Identifier UPDATE happy path on own child.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  UPDATE child_identifiers
     SET identifier_value = 'LRN-079-CLINIC-A-FIXED'
   WHERE id = v_ident_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T-11 FAILED: expected 1 row updated, got %', v_rows;
  END IF;
  IF (SELECT identifier_value FROM child_identifiers WHERE id = v_ident_a_id) <> 'LRN-079-CLINIC-A-FIXED' THEN
    RAISE EXCEPTION 'T-11 FAILED: identifier_value not persisted';
  END IF;
  RAISE NOTICE 'T-11 PASSED';


  ----------------------------------------------------------------
  -- T-12  Identifier UPDATE attempting to change child_profile_id is
  --       rejected (trigger ci_clinic_owned_update_guard, 42501).
  ----------------------------------------------------------------
  v_caught := false;
  v_caught_state := NULL;
  BEGIN
    UPDATE child_identifiers
       SET child_profile_id = v_child_b_id
     WHERE id = v_ident_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught       := true;
    v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12 FAILED: child_profile_id reassignment was not rejected';
  END IF;
  IF v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-12 FAILED: expected 42501, got %', v_caught_state;
  END IF;
  -- Confirm identifier still belongs to original child.
  RESET ROLE;
  IF (SELECT child_profile_id FROM child_identifiers WHERE id = v_ident_a_id) <> v_child_a_id THEN
    RAISE EXCEPTION 'T-12 FAILED: identifier child_profile_id mutated despite raise';
  END IF;
  RAISE NOTICE 'T-12 PASSED';


  ----------------------------------------------------------------
  -- T-13  Identifier no-op rejected (22000).
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_caught := false;
  v_caught_state := NULL;
  BEGIN
    UPDATE child_identifiers
       SET identifier_type   = identifier_type,
           identifier_value  = identifier_value,
           country_code      = country_code,
           label             = label,
           issued_by         = issued_by,
           valid_from        = valid_from,
           valid_to          = valid_to
     WHERE id = v_ident_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught       := true;
    v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-13 FAILED: identifier no-op was not rejected';
  END IF;
  IF v_caught_state <> '22000' THEN
    RAISE EXCEPTION 'T-13 FAILED: expected 22000, got %', v_caught_state;
  END IF;
  RAISE NOTICE 'T-13 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-14  Identifier DELETE happy path on own child.
  --       Insert a fresh identifier first to keep T-15/T-16 isolated.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_child_a_id, 'passport', 'P-079-DELETEME', 'PH');
  DELETE FROM child_identifiers
   WHERE child_profile_id = v_child_a_id
     AND identifier_type = 'passport'
     AND identifier_value = 'P-079-DELETEME';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T-14 FAILED: expected 1 row deleted, got %', v_rows;
  END IF;
  RAISE NOTICE 'T-14 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-15  Cross-clinic identifier UPDATE silently fails (RLS USING).
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  UPDATE child_identifiers
     SET identifier_value = 'FORGED'
   WHERE id = v_ident_b_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-15 FAILED: cross-clinic identifier UPDATE leaked, got %', v_rows;
  END IF;
  RESET ROLE;
  IF (SELECT identifier_value FROM child_identifiers WHERE id = v_ident_b_id) <> 'LRN-079-CLINIC-B' THEN
    RAISE EXCEPTION 'T-15 FAILED: clinic B identifier silently mutated';
  END IF;
  RAISE NOTICE 'T-15 PASSED';


  ----------------------------------------------------------------
  -- T-16  Identifier UPDATE colliding with unique index → 23505.
  --       Update clinic A's identifier value to clinic B's value
  --       (same type='lrn', same country='PH'). Partial unique index
  --       must reject.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-079@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_caught := false;
  v_caught_state := NULL;
  BEGIN
    UPDATE child_identifiers
       SET identifier_value = 'LRN-079-CLINIC-B'
     WHERE id = v_ident_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught       := true;
    v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-16 FAILED: unique-index collision was not rejected';
  END IF;
  IF v_caught_state <> '23505' THEN
    RAISE EXCEPTION 'T-16 FAILED: expected 23505, got %', v_caught_state;
  END IF;
  RAISE NOTICE 'T-16 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 079 smoke tests passed.';
END
$$ LANGUAGE plpgsql;

ROLLBACK;

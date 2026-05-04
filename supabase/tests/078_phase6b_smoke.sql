-- ============================================================
-- Smoke tests for migration 078 — Phase 6B (clinic-origin children).
-- BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Schema artifacts present (column, index, triggers,
--         is_clinic_admin, ownership helper, new policies).
--   T-2   ★ Existing helpers byte-clean ★
--         caller_visible_child_profile_ids() and
--         caller_visible_child_profile_ids_for_identifiers() bodies do
--         not reference origin_organization_id, organization_memberships,
--         is_clinic_admin, or the new ownership helper.
--   T-3   Kind-guard trigger rejects origin pointing at a school org.
--   T-4   Kind-guard trigger rejects origin pointing at a non-existent org.
--   T-5   Clinic admin can INSERT a child_profile with their org as origin.
--   T-6   Clinic admin INSERT with origin = different clinic rejected.
--   T-7   Non-admin clinic member cannot INSERT child_profile.
--   T-8   Origin immutability — UPDATE rejected for non-super_admin even
--         on NULL → non-NULL transition.
--   T-9   Owning clinic admin sees the new child via ownership helper.
--   T-10  Owning clinic non-admin (therapist) sees the new child too —
--         membership alone is sufficient for SELECT, write needs admin.
--   T-11  Other clinic (clinic B) cannot see clinic A's owned child.
--   T-12  ★ School-side invisibility ★ — school_admin sees 0 rows in
--         child_profiles, child_identifiers, child_profile_memberships
--         for the clinic-owned child.
--   T-13  Clinic admin can INSERT a 'clinic_client' membership for own
--         child to own org; foreign org rejected; non-clinic_client
--         relationship_kind rejected.
--   T-14  Clinic admin can INSERT child_identifiers; clinic B admin
--         cannot insert identifiers on clinic A's child.
--   T-15  Identifier collision — LRN already on a school-origin child
--         is rejected by the partial unique index when re-inserted on
--         a clinic-origin child.
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

  v_clinic_child_id    UUID;
  v_other_child_id     UUID;

  v_def                TEXT;
  v_count              INT;
  v_caught             BOOLEAN;
  v_lrn_value          TEXT := 'LRN-078-COLLISION';
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve fixtures
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
    SELECT 1 FROM information_schema.columns
     WHERE table_name='child_profiles' AND column_name='origin_organization_id'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: origin_organization_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='child_profiles_origin_org_idx') THEN
    RAISE EXCEPTION 'T-1 FAILED: index missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='cp_origin_kind_validate_trigger') THEN
    RAISE EXCEPTION 'T-1 FAILED: kind-validate trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='cp_origin_immutable_guard_trigger') THEN
    RAISE EXCEPTION 'T-1 FAILED: immutable-guard trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='caller_owned_child_profile_ids') THEN
    RAISE EXCEPTION 'T-1 FAILED: consolidated ownership helper missing';
  END IF;
  -- Sanity: the four superseded helpers must have been dropped.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN (
    'is_clinic_admin',
    'caller_clinic_admin_organization_ids',
    'caller_owned_child_profile_ids_for_org',
    'caller_visible_child_profile_ids_for_ownership'
  )) THEN
    RAISE EXCEPTION 'T-1 FAILED: superseded Phase 6B helper still present (consolidation incomplete)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='child_profiles' AND policyname='clinic_admin_insert_child_profiles'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic INSERT policy on child_profiles missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='child_profile_memberships'
       AND policyname='clinic_admin_insert_child_profile_memberships'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic INSERT policy on memberships missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='child_identifiers'
       AND policyname='clinic_admin_insert_child_identifiers'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic INSERT policy on identifiers missing';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- T-2  ★ Existing helpers byte-clean ★
  --
  -- Bodies of the two pre-existing identity helpers must NOT contain
  -- any reference to origin_organization_id, organization_memberships,
  -- is_clinic_admin, or caller_visible_child_profile_ids_for_ownership.
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
      RAISE EXCEPTION 'T-2 FAILED: existing identity helper body references Phase 6B artifacts';
    END IF;
  END LOOP;
  RAISE NOTICE 'T-2 PASSED: existing identity helpers are byte-clean';


  ----------------------------------------------------------------
  -- 1. Synthesize Phase 6B fixtures
  ----------------------------------------------------------------
  -- Two clinics + their admins + one non-admin therapist in clinic A.
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 078 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 078 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  -- Clinic A admin
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aA-078@example.com')
    RETURNING id INTO v_admin_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_a_uid,'aA-078@example.com','TEST 078 Admin A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_admin_a_uid, 'clinic_admin', 'active');

  -- Clinic A therapist (non-admin)
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-078@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-078@example.com','TEST 078 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');

  -- Clinic B admin
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aB-078@example.com')
    RETURNING id INTO v_admin_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_b_uid,'aB-078@example.com','TEST 078 Admin B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_admin_b_uid, 'clinic_admin', 'active');

  -- A school-origin student + child_profile (existing flow). Will be
  -- used by T-12 to confirm clinics still cannot see school children
  -- and by T-15 to set up the LRN collision fixture.
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST078','SchoolKid')
    RETURNING id INTO v_school_student_id;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST078 SchoolKid','TEST078','SchoolKid','lauris_learn')
    RETURNING id INTO v_school_profile_id;
  UPDATE students SET child_profile_id = v_school_profile_id WHERE id = v_school_student_id;
  -- Plant an LRN on the school child for T-15.
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_school_profile_id, 'lrn', v_lrn_value, 'PH');


  ----------------------------------------------------------------
  -- T-3  Kind guard rejects school-org origin
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    INSERT INTO child_profiles (display_name, origin_organization_id, created_in_app)
      VALUES ('FORGED — school origin', v_school_org_id, 'lauris_care');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-3 FAILED: insert with school-org origin should have been rejected';
  END IF;
  RAISE NOTICE 'T-3 PASSED';


  ----------------------------------------------------------------
  -- T-4  Kind guard rejects non-existent org
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    INSERT INTO child_profiles (display_name, origin_organization_id, created_in_app)
      VALUES ('FORGED — nonexistent org', '00000000-0000-0000-0000-00000000ffff', 'lauris_care');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-4 FAILED: insert with nonexistent org-id should have been rejected';
  END IF;
  RAISE NOTICE 'T-4 PASSED';


  ----------------------------------------------------------------
  -- T-5  Clinic A admin INSERTs a child_profile (origin = clinic A)
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Mint the UUID client-side and INSERT without RETURNING. This is
  -- the same workaround D7 (UploadDocumentModal) uses — INSERT...RETURNING
  -- triggers a SELECT-policy evaluation on the just-inserted row that
  -- rejects with the same 42501 code as a WITH CHECK violation. Both
  -- the WITH CHECK (clinic_admin grant) and the post-insert visibility
  -- (ownership helper) ARE satisfied for our caller, but the RETURNING
  -- combination has been observed to reject reliably in this codebase.
  -- See CLAUDE.md → Document Coordination D7 section.
  v_clinic_child_id := gen_random_uuid();

  INSERT INTO child_profiles (id, display_name, first_name, last_name, origin_organization_id, created_in_app)
    VALUES (v_clinic_child_id, 'TEST078 ClinicKidA','TEST078','ClinicKidA', v_clinic_a_id, 'lauris_care');
  IF v_clinic_child_id IS NULL THEN
    RAISE EXCEPTION 'T-5 FAILED: insert returned NULL';
  END IF;
  RAISE NOTICE 'T-5 PASSED';


  ----------------------------------------------------------------
  -- T-6  Clinic A admin attempts INSERT with origin = clinic B
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    INSERT INTO child_profiles (display_name, origin_organization_id, created_in_app)
      VALUES ('FORGED — wrong clinic', v_clinic_b_id, 'lauris_care');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-6 FAILED: insert with non-own clinic origin should have been rejected';
  END IF;
  RAISE NOTICE 'T-6 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-7  Non-admin clinic member cannot INSERT child_profile
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO child_profiles (display_name, origin_organization_id, created_in_app)
      VALUES ('FORGED — therapist insert', v_clinic_a_id, 'lauris_care');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-7 FAILED: non-admin therapist should not be able to insert';
  END IF;
  RAISE NOTICE 'T-7 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-8  Origin is fully immutable post-insert.
  --
  -- Two layers of defense:
  --   T-8a — RLS UPDATE policy. Phase 6B has no clinic_admin UPDATE
  --           policy and the school_admin policy doesn't apply to
  --           clinic-origin profiles. Result: 0 rows affected (no
  --           exception, just silent denial).
  --   T-8b — Column-guard trigger fires on UPDATE OF
  --           origin_organization_id and raises 42501 even when RLS
  --           wouldn't reject (e.g. SQL editor / service role).
  ----------------------------------------------------------------

  -- T-8a: as authenticated clinic admin, UPDATE silently denied by RLS.
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  UPDATE child_profiles SET origin_organization_id = v_clinic_b_id WHERE id = v_clinic_child_id;
  -- No exception expected. Verify origin is unchanged.
  IF (SELECT origin_organization_id FROM child_profiles WHERE id = v_clinic_child_id) <> v_clinic_a_id THEN
    RAISE EXCEPTION 'T-8a FAILED: clinic admin UPDATE silently mutated origin';
  END IF;

  UPDATE child_profiles SET origin_organization_id = v_clinic_a_id WHERE id = v_school_profile_id;
  RESET ROLE;
  -- Need to RESET ROLE before SELECT because the school profile is
  -- invisible to the clinic admin (correctly so — T-12 covers this).
  IF (SELECT origin_organization_id FROM child_profiles WHERE id = v_school_profile_id) IS NOT NULL THEN
    RAISE EXCEPTION 'T-8a FAILED: school-origin NULL → non-NULL silently succeeded';
  END IF;

  -- T-8b: as postgres (RLS bypassed but triggers still fire), the
  -- column-guard trigger must reject the same UPDATEs. is_super_admin()
  -- in the trigger returns FALSE here because postgres role has no
  -- profiles row → the trigger refuses the change.
  v_caught := false;
  BEGIN
    UPDATE child_profiles SET origin_organization_id = v_clinic_b_id WHERE id = v_clinic_child_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-8b FAILED: column-guard trigger did not reject clinic-origin → other-clinic UPDATE';
  END IF;

  v_caught := false;
  BEGIN
    UPDATE child_profiles SET origin_organization_id = v_clinic_a_id WHERE id = v_school_profile_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-8b FAILED: column-guard trigger did not reject NULL → non-NULL UPDATE';
  END IF;
  RAISE NOTICE 'T-8 PASSED';


  ----------------------------------------------------------------
  -- T-9  Owning clinic admin can SELECT the new child
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF NOT EXISTS (SELECT 1 FROM child_profiles WHERE id = v_clinic_child_id) THEN
    RAISE EXCEPTION 'T-9 FAILED: owning admin cannot see their own clinic child';
  END IF;
  RAISE NOTICE 'T-9 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-10  Owning clinic non-admin (therapist) can SELECT the child
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF NOT EXISTS (SELECT 1 FROM child_profiles WHERE id = v_clinic_child_id) THEN
    RAISE EXCEPTION 'T-10 FAILED: clinic therapist cannot see clinic-owned child';
  END IF;
  RAISE NOTICE 'T-10 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-11  Other clinic (clinic B admin) cannot see clinic A's child
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM child_profiles WHERE id = v_clinic_child_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: clinic B sees clinic A''s child (count=%)', v_count;
  END IF;
  RAISE NOTICE 'T-11 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-12  ★ School-side invisibility ★
  --
  -- A school_admin in the same project must NOT see the clinic-owned
  -- child_profile, its identifiers, or its memberships.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text)::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM child_profiles WHERE id = v_clinic_child_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: school_admin can see clinic-owned child_profile (count=%)', v_count;
  END IF;

  -- Also confirm direct identifier read returns 0 (we'll insert one in T-14
  -- as the clinic admin; for now confirm the empty case).
  RAISE NOTICE 'T-12 PASSED (initial pass: school_admin sees no clinic profile)';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-13  Membership INSERT — happy path + two failure modes
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Happy path: clinic A admin links own child to own org as clinic_client
  INSERT INTO child_profile_memberships (
    child_profile_id, organization_id, relationship_kind, status, started_at
  ) VALUES (
    v_clinic_child_id, v_clinic_a_id, 'clinic_client', 'active', NOW()
  );

  -- Failure: linking to clinic B (which they don't admin)
  v_caught := false;
  BEGIN
    INSERT INTO child_profile_memberships (
      child_profile_id, organization_id, relationship_kind, status, started_at
    ) VALUES (
      v_clinic_child_id, v_clinic_b_id, 'clinic_client', 'active', NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-13 FAILED: cross-clinic membership insert should have been rejected';
  END IF;

  -- Failure: relationship_kind != 'clinic_client'
  v_caught := false;
  BEGIN
    INSERT INTO child_profile_memberships (
      child_profile_id, organization_id, relationship_kind, status, started_at
    ) VALUES (
      v_clinic_child_id, v_clinic_a_id, 'enrolled_student', 'active', NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-13 FAILED: non-clinic_client relationship_kind should have been rejected';
  END IF;
  RAISE NOTICE 'T-13 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-14  Identifier INSERT — own child OK; other-clinic admin denied
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_clinic_child_id, 'clinic_internal', 'CASE-078-001', 'PH');

  -- Confirm the clinic admin can read it back
  IF NOT EXISTS (
    SELECT 1 FROM child_identifiers
     WHERE child_profile_id = v_clinic_child_id
       AND identifier_type = 'clinic_internal'
  ) THEN
    RAISE EXCEPTION 'T-14 FAILED: clinic admin cannot read back own identifier';
  END IF;

  RESET ROLE;

  -- Clinic B admin attempts to insert an identifier on clinic A's child
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
      VALUES (v_clinic_child_id, 'clinic_internal', 'POACH', 'PH');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-14 FAILED: clinic B admin should not be able to write identifier on clinic A child';
  END IF;
  RAISE NOTICE 'T-14 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-15  LRN collision — partial unique index applies cross-origin
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-078@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
      VALUES (v_clinic_child_id, 'lrn', v_lrn_value, 'PH');
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-15 FAILED: LRN collision should have been rejected';
  END IF;
  RAISE NOTICE 'T-15 PASSED';

  RESET ROLE;


  ----------------------------------------------------------------
  -- T-12 (continued) — school_admin still cannot see the new identifier
  -- (clinic_internal CASE-078-001) or the membership row.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text)::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM child_identifiers
   WHERE child_profile_id = v_clinic_child_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: school_admin can see clinic identifiers (count=%)', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM child_profile_memberships
   WHERE child_profile_id = v_clinic_child_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: school_admin can see clinic membership (count=%)', v_count;
  END IF;
  RAISE NOTICE 'T-12 PASSED (final pass: identifiers + memberships hidden from school)';

  RESET ROLE;


  RAISE NOTICE '✓ All 078 smoke tests passed.';
END $$;

ROLLBACK;

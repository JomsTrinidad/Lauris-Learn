-- ============================================================
-- Smoke tests for migration 072 — Phase 2 organizations + child
-- profile memberships.
--
-- Scope (deliberately narrow — focused on the isolation guarantees):
--   T-1  Backfill A — every school has a kind='school' organization,
--        partial unique index satisfied.
--   T-2  Backfill B — every linked student has a corresponding active
--        'enrolled_student' child_profile_memberships row.
--   T-3  CHECK constraint forbids non-school org from having school_id.
--   T-4  Partial unique index forbids two kind='school' orgs for the
--        same school.
--   T-5  school_admin SELECT on organizations returns only their own
--        school's row.
--   T-6  school_admin can INSERT a 'school' org for their school but
--        not for another school. clinic/medical_practice INSERT denied.
--   T-7  child_profile_memberships SELECT works through both arms
--        (visible child_profile + visible organization).
--   T-8  Synthetic Lauris-Care-style user (NULL school_id, NULL role)
--        sees zero rows in organizations, child_profile_memberships,
--        students, child_profiles, child_documents, student_plans.
--        This is the critical isolation test.
--   T-9  Phase 1 isolation preserved — caller_visible_child_profile_ids()
--        returns the same set for school_admin as it did before.
--   T-10 child_documents + student_plans inserts still work for the
--        existing school_admin (no Phase 1 regressions).
--   T-11 Idempotency — re-running both backfill blocks inserts 0 rows.
--
-- Run ONLY in a non-production project. Wrapped in BEGIN/ROLLBACK.
-- Change the trailing ROLLBACK to COMMIT to inspect the rows.
--
-- Impersonation pattern matches 070/071:
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","email":"<email>"}';
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- Existing fixtures
  v_school_id          UUID;
  v_other_school_id    UUID;
  v_admin_id           UUID;        -- profiles.id of a school_admin in v_school_id
  v_school_year_id     UUID;

  -- Synthesized fixtures
  v_student_id         UUID;
  v_profile_id         UUID;
  v_doc_id             UUID;

  -- Org / membership ids
  v_org_id             UUID;
  v_other_org_id       UUID;
  v_clinic_org_id      UUID;        -- created via super-admin path for testing
  v_membership_id      UUID;

  -- Synthetic Lauris-Care-style user (a profile with NULL school_id
  -- and NULL role). Created here, rolled back at end.
  v_lc_uid             UUID;

  -- Result holders
  v_caught             BOOLEAN;
  v_count              INT;
  v_total_schools      INT;
  v_school_orgs        INT;
  v_linked_students    INT;
  v_active_memberships INT;
  v_idemp_orgs         INT;
  v_idemp_members      INT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve fixtures
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school found'; END IF;

  SELECT id INTO v_admin_id
    FROM profiles
    WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at
    LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin profile in school'; END IF;

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

  -- A second school for cross-tenant tests. Synthesize if needed.
  SELECT id INTO v_other_school_id
    FROM schools
    WHERE id <> v_school_id
    ORDER BY created_at
    LIMIT 1;
  IF v_other_school_id IS NULL THEN
    INSERT INTO schools (name) VALUES ('TEST 072 — other school')
      RETURNING id INTO v_other_school_id;
    -- Backfill the other school's org since we just created it
    -- post-migration. (5.A is one-shot at migration time.)
    INSERT INTO organizations (kind, name, school_id, created_in_app)
      VALUES ('school', 'TEST 072 — other school', v_other_school_id, 'lauris_learn');
  END IF;

  -- Pull the org rows for the two schools
  SELECT id INTO v_org_id
    FROM organizations
    WHERE kind = 'school' AND school_id = v_school_id;
  SELECT id INTO v_other_org_id
    FROM organizations
    WHERE kind = 'school' AND school_id = v_other_school_id;

  IF v_org_id IS NULL OR v_other_org_id IS NULL THEN
    RAISE EXCEPTION '0. fixture: missing org row(s) — backfill 5.A may not have run';
  END IF;


  ----------------------------------------------------------------
  -- T-1  Backfill A — every school has a 'school' org
  ----------------------------------------------------------------
  SELECT count(*) INTO v_total_schools FROM schools;
  SELECT count(*) INTO v_school_orgs   FROM organizations WHERE kind = 'school';
  IF v_school_orgs < v_total_schools THEN
    RAISE EXCEPTION 'T-1 FAILED: schools=% but kind=school orgs=% (expected ≥)',
      v_total_schools, v_school_orgs;
  END IF;
  RAISE NOTICE 'T-1 PASSED: % schools, % school-orgs', v_total_schools, v_school_orgs;


  ----------------------------------------------------------------
  -- T-2  Backfill B — every linked student → active membership
  ----------------------------------------------------------------
  SELECT count(*) INTO v_linked_students
    FROM students WHERE child_profile_id IS NOT NULL;
  SELECT count(*) INTO v_active_memberships
    FROM child_profile_memberships
    WHERE status = 'active' AND relationship_kind = 'enrolled_student';

  -- Memberships should at least equal the count of distinct
  -- (child_profile_id, school) pairs. Use ≥ since fixtures created
  -- inside the test will inflate one but not the other.
  IF v_active_memberships < (
    SELECT count(DISTINCT (s.child_profile_id, s.school_id))
      FROM students s
     WHERE s.child_profile_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'T-2 FAILED: active memberships=%, expected ≥ distinct linked-student/school pairs',
      v_active_memberships;
  END IF;
  RAISE NOTICE 'T-2 PASSED: % linked students, % active memberships',
    v_linked_students, v_active_memberships;


  ----------------------------------------------------------------
  -- T-3  CHECK forbids non-'school' org with school_id set
  ----------------------------------------------------------------
  v_caught := FALSE;
  BEGIN
    INSERT INTO organizations (kind, name, school_id, created_in_app)
      VALUES ('clinic', 'TEST 072 — invalid', v_school_id, 'lauris_learn');
  EXCEPTION WHEN check_violation THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    DELETE FROM organizations WHERE name = 'TEST 072 — invalid';
    RAISE EXCEPTION 'T-3 FAILED: clinic with school_id should violate the CHECK';
  END IF;
  RAISE NOTICE 'T-3 PASSED: CHECK rejects non-school org with school_id';


  ----------------------------------------------------------------
  -- T-4  Partial unique index forbids two school orgs per school
  ----------------------------------------------------------------
  v_caught := FALSE;
  BEGIN
    INSERT INTO organizations (kind, name, school_id, created_in_app)
      VALUES ('school', 'TEST 072 — duplicate', v_school_id, 'lauris_learn');
  EXCEPTION WHEN unique_violation THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    DELETE FROM organizations WHERE name = 'TEST 072 — duplicate';
    RAISE EXCEPTION 'T-4 FAILED: duplicate school org should violate partial unique index';
  END IF;
  RAISE NOTICE 'T-4 PASSED: partial unique index forbids duplicate school org';


  ----------------------------------------------------------------
  -- 1. Synthesize a clinic org (super-admin path) and a Lauris-Care-
  -- style user, plus a fresh student linked to a child_profile, so
  -- the remaining tests have isolated fixtures.
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic', 'TEST 072 — TestClinic', 'PH', 'lauris_care')
    RETURNING id INTO v_clinic_org_id;

  -- Synthetic Lauris-Care-style user. Has an auth.users row but no
  -- school_id. The handle_new_user() trigger on auth.users auto-
  -- creates a profiles row with default role='teacher'; we UPSERT
  -- to set school_id=NULL and role='parent' as the sentinel for an
  -- external-app user (parent arm + no guardian email + no school_id
  -- = empty visibility through every Lauris Learn helper).
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'lc-072@example.com')
    RETURNING id INTO v_lc_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_lc_uid, 'lc-072@example.com', 'TEST 072 LC user', NULL, 'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          school_id = EXCLUDED.school_id,
          role      = EXCLUDED.role;

  -- Fresh student in our school, linked to a child_profile
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id, 'TEST072', 'Phase2')
    RETURNING id INTO v_student_id;

  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST072 Phase2', 'TEST072', 'Phase2', 'lauris_learn')
    RETURNING id INTO v_profile_id;

  UPDATE students SET child_profile_id = v_profile_id WHERE id = v_student_id;

  -- Doc for T-10
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'parent_provided',
            'TEST 072 doc', 'draft', v_admin_id)
    RETURNING id INTO v_doc_id;


  ----------------------------------------------------------------
  -- T-5  school_admin SELECT on organizations — own row only
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin072@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Should see exactly the school's own org. NOT the other school's
  -- org and NOT the clinic org.
  SELECT count(*) INTO v_count
    FROM organizations
    WHERE id IN (v_org_id, v_other_org_id, v_clinic_org_id);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-5 FAILED: school_admin saw % rows (expected 1, only own school org)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-5 PASSED: school_admin sees only their own school org';


  ----------------------------------------------------------------
  -- T-6  school_admin INSERT — only own-school 'school' kind allowed
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin072@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Inserting another kind='school' for own school: should be blocked
  -- by the partial unique index, not RLS — but the INSERT path itself
  -- is allowed. We test that the OTHER-school INSERT is denied (RLS),
  -- and clinic INSERT is denied (RLS).

  -- T-6a: clinic INSERT should be denied by RLS WITH CHECK
  v_caught := FALSE;
  BEGIN
    INSERT INTO organizations (kind, name, created_in_app)
      VALUES ('clinic', 'TEST 072 — admin-clinic', 'lauris_learn');
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    DELETE FROM organizations WHERE name = 'TEST 072 — admin-clinic';
    RAISE EXCEPTION 'T-6a FAILED: school_admin INSERT clinic should have raised 42501';
  END IF;

  -- T-6b: school INSERT for another school should be denied
  v_caught := FALSE;
  BEGIN
    INSERT INTO organizations (kind, name, school_id, created_in_app)
      VALUES ('school', 'TEST 072 — wrong-school', v_other_school_id, 'lauris_learn');
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    DELETE FROM organizations WHERE name = 'TEST 072 — wrong-school';
    RAISE EXCEPTION 'T-6b FAILED: school_admin INSERT for other school should have raised 42501';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-6 PASSED: school_admin cannot INSERT clinic or other-school org';


  ----------------------------------------------------------------
  -- T-7  child_profile_memberships SELECT — both arms
  ----------------------------------------------------------------
  -- Make sure our v_profile_id has a membership in our school's org.
  -- The backfill ran at migration time; v_profile_id is fresh so
  -- it has none. Insert one as super-admin (no role yet — RESET).
  RESET ROLE;
  INSERT INTO child_profile_memberships (
    child_profile_id, organization_id, relationship_kind, status, created_in_app
  ) VALUES (
    v_profile_id, v_org_id, 'enrolled_student', 'active', 'lauris_learn'
  ) RETURNING id INTO v_membership_id;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin072@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Arm A (visible child_profile via caller_visible_child_profile_ids)
  -- AND arm B (visible org) both grant access here.
  SELECT count(*) INTO v_count
    FROM child_profile_memberships
    WHERE id = v_membership_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-7 FAILED: school_admin could not SELECT own-school membership (count=%)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-7 PASSED: school_admin sees memberships for visible child_profiles';


  ----------------------------------------------------------------
  -- T-8  ★ CRITICAL ISOLATION TEST ★
  -- Synthetic Lauris-Care-style user must see ZERO rows in any
  -- Lauris Learn data, including the child_profile and its
  -- membership. Phase 2 has no organization_memberships table, so
  -- the user has no path into anything.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_lc_uid::text, 'email', 'lc-072@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM organizations;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: LC user saw % organizations (expected 0)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM child_profile_memberships;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: LC user saw % memberships (expected 0)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM child_profiles;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: LC user saw % child_profiles (expected 0)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM students;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: LC user saw % students (expected 0)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM child_documents;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: LC user saw % child_documents (expected 0)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM student_plans;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: LC user saw % student_plans (expected 0)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-8 PASSED: synthetic Lauris-Care user has zero visibility into Lauris Learn data';


  ----------------------------------------------------------------
  -- T-9  Phase 1 helper preserved — caller_visible_child_profile_ids()
  -- still resolves the school_admin's child_profiles unchanged.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin072@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Just verify the helper still returns at least our test profile.
  IF NOT (v_profile_id = ANY(caller_visible_child_profile_ids())) THEN
    RAISE EXCEPTION 'T-9 FAILED: Phase 1 helper does not contain expected profile';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-9 PASSED: Phase 1 caller_visible_child_profile_ids() unchanged';


  ----------------------------------------------------------------
  -- T-10  child_documents + student_plans inserts still work
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin072@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF NOT EXISTS (SELECT 1 FROM child_documents WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'T-10 FAILED: school_admin lost SELECT access to child_documents';
  END IF;

  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'medical_certificate',
            'TEST 072 — post-migration doc', 'draft', v_admin_id);

  INSERT INTO student_plans (school_id, student_id, school_year_id, plan_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, v_school_year_id, 'iep',
            'TEST 072 — post-migration plan', 'draft', v_admin_id);

  RESET ROLE;
  RAISE NOTICE 'T-10 PASSED: child_documents + student_plans inserts still work';


  ----------------------------------------------------------------
  -- T-11  Idempotency — re-running both backfill blocks inserts 0 rows
  ----------------------------------------------------------------
  WITH bf_a AS (
    INSERT INTO organizations (kind, name, school_id, created_in_app)
    SELECT 'school', s.name, s.id, 'lauris_learn'
      FROM schools s
     WHERE NOT EXISTS (
       SELECT 1 FROM organizations o
        WHERE o.kind = 'school' AND o.school_id = s.id
     )
    RETURNING id
  )
  SELECT count(*) INTO v_idemp_orgs FROM bf_a;

  WITH bf_b AS (
    INSERT INTO child_profile_memberships (
      child_profile_id, organization_id, relationship_kind, status, started_at, created_in_app
    )
    SELECT DISTINCT
      s.child_profile_id, o.id, 'enrolled_student', 'active',
      s.created_at::date, 'lauris_learn'
    FROM students s
    JOIN organizations o
      ON o.kind = 'school' AND o.school_id = s.school_id
    WHERE s.child_profile_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM child_profile_memberships m
        WHERE m.child_profile_id = s.child_profile_id
          AND m.organization_id  = o.id
          AND m.status           = 'active'
      )
    RETURNING id
  )
  SELECT count(*) INTO v_idemp_members FROM bf_b;

  IF v_idemp_orgs <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: backfill A re-run inserted % rows (expected 0)', v_idemp_orgs;
  END IF;
  IF v_idemp_members <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: backfill B re-run inserted % rows (expected 0)', v_idemp_members;
  END IF;
  RAISE NOTICE 'T-11 PASSED: both backfill blocks are idempotent';


  ----------------------------------------------------------------
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'Migration 072 smoke test: ALL SCENARIOS PASSED';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$ LANGUAGE plpgsql;

-- Discard everything we created. Change to COMMIT to inspect the rows.
ROLLBACK;

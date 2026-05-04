-- ============================================================
-- Smoke tests for migration 074 — Phase 4 (consent + identity visibility).
--
-- Scope:
--   T-1   Schema applied — table, both helpers, indexes, column-guard
--         trigger.
--   T-2   valid_until is NOT NULL with default of NOW() + 1 year.
--   T-3   Lauris Learn unchanged — school_admin still resolves their
--         own school's child_profiles via the helper.
--   T-4   Phase 3 isolation regression — clinic user with active
--         membership but NO grant sees zero child_profiles.
--   T-5   ★ Phase 4 critical — clinic user WITH active grant sees
--         the granted child_profile but NOT child_identifiers ★
--   T-6   Grant expiry → identity access drops.
--   T-7   Grant revocation → identity access drops AND clinic user
--         can no longer see the revoked grant row (defense-in-depth
--         status='active' clamp in the SELECT policy).
--   T-8   Asymmetric SELECT — school_admin can still see the
--         revoked grant for audit; clinic user cannot.
--   T-9   Cross-clinic isolation — clinic B without a grant sees
--         nothing of profile P.
--   T-10  CHECK constraints — source==target, invalid scope, invalid
--         granted_by_kind, valid_until <= valid_from all rejected.
--   T-11  school_admin INSERT scope: own school OK; other school
--         denied; child not in their school denied; granted_by_kind
--         lying about parent denied.
--   T-12  Column-guard on UPDATE — mutating immutable columns rejected;
--         lifecycle columns (status, valid_until, revoked_*) accepted.
--   T-13  Documents and plans STILL hidden from clinic user despite
--         active identity grant. (Phase 5 boundary.)
--   T-14  child_identifiers STILL hidden from clinic user despite
--         active identity grant. (Phase 5 boundary.)
--   T-15  ★ Phase 5A — identifier sharing via scope upgrade ★
--         T-15a identity_only → 0 child_identifiers
--         T-15b identity_with_identifiers → identifiers visible
--         T-15c expired grant → 0 child_identifiers
--         T-15d revoked grant → 0 child_identifiers
--         (Replaces the original Phase-4-era helper-body assertion;
--         identifier sharing is now wired through the same grant
--         table via scope = 'identity_with_identifiers'.)
--
-- Run ONLY in a non-production project. Wrapped in BEGIN/ROLLBACK.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- Existing fixtures
  v_school_id            UUID;
  v_admin_id             UUID;
  v_school_year_id       UUID;
  v_school_org_id        UUID;

  -- Synthesized fixtures
  v_student_id           UUID;
  v_profile_id           UUID;
  v_doc_id               UUID;

  -- Phase-3 actors
  v_clinic_a_id          UUID;
  v_clinic_b_id          UUID;
  v_therapist_a_uid      UUID;
  v_therapist_b_uid      UUID;
  v_mem_a                UUID;
  v_mem_b                UUID;

  -- Phase-4 grant ids
  v_grant_id             UUID;
  v_grant_b_id           UUID;

  -- Result holders
  v_caught               BOOLEAN;
  v_count                INT;
  v_default_valid_until  TIMESTAMPTZ;
  v_status_after         TEXT;
  v_helper_def           TEXT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve fixtures
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school found'; END IF;

  SELECT id INTO v_admin_id
    FROM profiles
    WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin in school'; END IF;

  SELECT id INTO v_school_year_id
    FROM school_years
    WHERE school_id = v_school_id AND status = 'active'
    LIMIT 1;
  IF v_school_year_id IS NULL THEN
    SELECT id INTO v_school_year_id
      FROM school_years WHERE school_id = v_school_id
      ORDER BY start_date DESC LIMIT 1;
  END IF;

  SELECT id INTO v_school_org_id
    FROM organizations WHERE kind = 'school' AND school_id = v_school_id;
  IF v_school_org_id IS NULL THEN
    RAISE EXCEPTION '0. fixture: missing school org — migration 072 backfill A may not have run';
  END IF;


  ----------------------------------------------------------------
  -- T-1  Schema applied — table + helpers + column-guard trigger
  ----------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'child_profile_access_grants') THEN
    RAISE EXCEPTION 'T-1 FAILED: table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'caller_visible_child_profile_ids_for_identifiers') THEN
    RAISE EXCEPTION 'T-1 FAILED: identifier helper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cpag_column_guard_trigger') THEN
    RAISE EXCEPTION 'T-1 FAILED: column-guard trigger missing';
  END IF;
  RAISE NOTICE 'T-1 PASSED: schema artifacts present';


  ----------------------------------------------------------------
  -- 1. Synthesize Phase-4 fixtures
  ----------------------------------------------------------------

  -- Two clinic orgs + therapists with active memberships
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic', 'TEST 074 — Clinic A', 'PH', 'lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic', 'TEST 074 — Clinic B', 'PH', 'lauris_care')
    RETURNING id INTO v_clinic_b_id;

  -- The handle_new_user() trigger on auth.users (schema.sql) auto-
  -- creates a profiles row with default role='teacher'. We override
  -- it via INSERT … ON CONFLICT (id) DO UPDATE so the test works
  -- whether or not the trigger fired.
  --
  -- Sentinel role 'parent': profiles.role is NOT NULL with no enum
  -- value for "external app user". Combined with school_id=NULL and
  -- no matching guardians.email row, the parent arms in the
  -- visibility helpers resolve to empty sets, giving the same strict
  -- isolation as a true non-Lauris-Learn user.
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'tA-074@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid, 'tA-074@example.com', 'TEST 074 Therapist A', NULL, 'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          school_id = EXCLUDED.school_id,
          role      = EXCLUDED.role;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'tB-074@example.com')
    RETURNING id INTO v_therapist_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_b_uid, 'tB-074@example.com', 'TEST 074 Therapist B', NULL, 'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          school_id = EXCLUDED.school_id,
          role      = EXCLUDED.role;

  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active')
    RETURNING id INTO v_mem_a;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_therapist_b_uid, 'therapist', 'active')
    RETURNING id INTO v_mem_b;

  -- Student + linked child_profile
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id, 'TEST074', 'Phase4')
    RETURNING id INTO v_student_id;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST074 Phase4', 'TEST074', 'Phase4', 'lauris_learn')
    RETURNING id INTO v_profile_id;
  UPDATE students SET child_profile_id = v_profile_id WHERE id = v_student_id;

  -- Add a sample LRN so child_identifiers is non-empty (T-14)
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_profile_id, 'lrn', 'LRN-074-TEST', 'PH');

  -- A document for T-13's negative check
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'parent_provided',
            'TEST 074 doc', 'draft', v_admin_id)
    RETURNING id INTO v_doc_id;


  ----------------------------------------------------------------
  -- T-2  valid_until is NOT NULL with default ≈ NOW() + 1 year
  ----------------------------------------------------------------
  -- Insert a grant without specifying valid_until; verify default
  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status
  ) VALUES (
    v_profile_id, v_school_org_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'identity_only', 'active'
  ) RETURNING valid_until INTO v_default_valid_until;

  IF v_default_valid_until IS NULL THEN
    RAISE EXCEPTION 'T-2 FAILED: valid_until default produced NULL — should be NOT NULL';
  END IF;
  -- Default should be roughly 1 year from now (within a 5-minute slack)
  IF v_default_valid_until < (NOW() + INTERVAL '364 days')
     OR v_default_valid_until > (NOW() + INTERVAL '366 days') THEN
    RAISE EXCEPTION 'T-2 FAILED: valid_until default = % (expected ~NOW()+1 year)', v_default_valid_until;
  END IF;
  RAISE NOTICE 'T-2 PASSED: valid_until NOT NULL DEFAULT NOW()+1 year';

  -- Use this row as v_grant_id for the rest of the tests
  SELECT id INTO v_grant_id
    FROM child_profile_access_grants
    WHERE child_profile_id = v_profile_id
      AND target_organization_id = v_clinic_a_id
      AND status = 'active';


  ----------------------------------------------------------------
  -- T-3  Lauris Learn unchanged — school_admin sees own profiles
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin074@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF NOT (v_profile_id = ANY(caller_visible_child_profile_ids())) THEN
    RAISE EXCEPTION 'T-3 FAILED: Phase 1 helper does not contain expected profile';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-3 PASSED: school_admin still sees own profile';


  ----------------------------------------------------------------
  -- T-4  Phase 3 isolation regression — clinic A WITHOUT grant
  -- (we need a fresh isolated check; the grant is currently active.
  -- We temporarily revoke it for this test then restore.)
  ----------------------------------------------------------------
  RESET ROLE;
  UPDATE child_profile_access_grants
     SET status='revoked', revoked_at=NOW(), revoked_by_profile_id=v_admin_id
     WHERE id = v_grant_id;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM child_profiles WHERE id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-4 FAILED: clinic A therapist saw profile P without active grant (count=%)', v_count;
  END IF;

  RESET ROLE;
  -- Restore the grant for subsequent tests
  UPDATE child_profile_access_grants
     SET status='active', revoked_at=NULL, revoked_by_profile_id=NULL
     WHERE id = v_grant_id;
  RAISE NOTICE 'T-4 PASSED: clinic without active grant sees zero child_profiles';


  ----------------------------------------------------------------
  -- T-5  ★ Phase 4 critical — clinic A WITH active grant sees
  --        the granted child_profile but NOT child_identifiers ★
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- child_profile visible
  SELECT count(*) INTO v_count FROM child_profiles WHERE id = v_profile_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-5 FAILED: clinic A therapist could not see granted profile (count=%)', v_count;
  END IF;

  -- child_identifiers NOT visible (Phase 5 boundary)
  SELECT count(*) INTO v_count FROM child_identifiers WHERE child_profile_id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-5 FAILED: clinic A therapist saw % identifiers (Phase 5 boundary breached)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-5 PASSED: clinic with active grant sees child_profile but not child_identifiers';


  ----------------------------------------------------------------
  -- T-6  Grant expiry → access drops
  --
  -- Within a transaction NOW() is fixed (transaction_timestamp), so
  -- to make `valid_until < NOW()` while keeping the CHECK
  -- (valid_until > valid_from) satisfied, we must move valid_from
  -- into the past. The column-guard trigger normally forbids that;
  -- its super_admin bypass relies on auth.uid() resolving to a
  -- super_admin profile — which it doesn't under the Postgres test
  -- runner. We disable the trigger for this single UPDATE.
  ----------------------------------------------------------------
  RESET ROLE;
  ALTER TABLE child_profile_access_grants DISABLE TRIGGER cpag_column_guard_trigger;
  UPDATE child_profile_access_grants
     SET valid_from  = NOW() - INTERVAL '2 hours',
         valid_until = NOW() - INTERVAL '1 hour'
     WHERE id = v_grant_id;
  ALTER TABLE child_profile_access_grants ENABLE TRIGGER cpag_column_guard_trigger;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM child_profiles WHERE id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: expired grant still grants visibility (count=%)', v_count;
  END IF;

  RESET ROLE;
  -- Restore valid window
  UPDATE child_profile_access_grants
     SET valid_until = NOW() + INTERVAL '90 days'
     WHERE id = v_grant_id;
  RAISE NOTICE 'T-6 PASSED: expired grant drops identity access';


  ----------------------------------------------------------------
  -- T-7  Revocation → identity access drops AND clinic user can no
  --      longer see the grant row (defense-in-depth status='active')
  ----------------------------------------------------------------
  RESET ROLE;
  UPDATE child_profile_access_grants
     SET status='revoked', revoked_at=NOW(),
         revoked_by_profile_id=v_admin_id, revoke_reason='T-7 test'
     WHERE id = v_grant_id;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM child_profiles WHERE id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: revoked grant still grants identity (count=%)', v_count;
  END IF;

  -- ★ Critical adjustment from this approval: clinic user must NOT
  -- see revoked grant rows targeting their org.
  SELECT count(*) INTO v_count
    FROM child_profile_access_grants
    WHERE id = v_grant_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: clinic user saw revoked grant row (count=%) — status=''active'' SELECT clamp not enforced', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-7 PASSED: revocation drops identity AND hides the grant row from clinic';


  ----------------------------------------------------------------
  -- T-8  Asymmetric SELECT — school_admin still sees the revoked
  --      grant for audit, clinic does not.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM child_profile_access_grants
    WHERE id = v_grant_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-8 FAILED: school_admin lost SELECT on revoked grant (count=%, expected 1)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-8 PASSED: school_admin retains audit SELECT on revoked grant';

  -- Restore the grant for subsequent tests
  UPDATE child_profile_access_grants
     SET status='active', revoked_at=NULL, revoked_by_profile_id=NULL, revoke_reason=NULL
     WHERE id = v_grant_id;


  ----------------------------------------------------------------
  -- T-9  Cross-clinic isolation
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_b_uid::text, 'email', 'tB-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM child_profiles WHERE id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-9 FAILED: clinic B therapist saw profile P without grant (count=%)', v_count;
  END IF;

  -- And cannot see clinic A's grant row
  SELECT count(*) INTO v_count
    FROM child_profile_access_grants
    WHERE id = v_grant_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-9 FAILED: clinic B therapist saw clinic A''s grant (count=%)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-9 PASSED: cross-clinic isolation';


  ----------------------------------------------------------------
  -- T-10  CHECK constraints
  ----------------------------------------------------------------
  RESET ROLE;

  -- source == target
  v_caught := FALSE;
  BEGIN
    INSERT INTO child_profile_access_grants
      (child_profile_id, source_organization_id, target_organization_id,
       granted_by_profile_id, granted_by_kind)
      VALUES (v_profile_id, v_clinic_a_id, v_clinic_a_id, v_admin_id, 'super_admin');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: source==target accepted'; END IF;

  -- Invalid scope
  v_caught := FALSE;
  BEGIN
    INSERT INTO child_profile_access_grants
      (child_profile_id, source_organization_id, target_organization_id,
       granted_by_profile_id, granted_by_kind, scope)
      VALUES (v_profile_id, v_school_org_id, v_clinic_b_id, v_admin_id, 'super_admin', 'document_share');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: invalid scope accepted'; END IF;

  -- Invalid granted_by_kind
  v_caught := FALSE;
  BEGIN
    INSERT INTO child_profile_access_grants
      (child_profile_id, source_organization_id, target_organization_id,
       granted_by_profile_id, granted_by_kind)
      VALUES (v_profile_id, v_school_org_id, v_clinic_b_id, v_admin_id, 'admin');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: invalid granted_by_kind accepted'; END IF;

  -- valid_until <= valid_from
  v_caught := FALSE;
  BEGIN
    INSERT INTO child_profile_access_grants
      (child_profile_id, source_organization_id, target_organization_id,
       granted_by_profile_id, granted_by_kind,
       valid_from, valid_until)
      VALUES (v_profile_id, v_school_org_id, v_clinic_b_id, v_admin_id, 'super_admin',
              NOW(), NOW() - INTERVAL '1 day');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: valid_until <= valid_from accepted'; END IF;

  RAISE NOTICE 'T-10 PASSED: CHECK constraints enforced';


  ----------------------------------------------------------------
  -- T-11  school_admin INSERT scope
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin074@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- T-11a: own school → clinic B → child in own school: should ALLOW
  INSERT INTO child_profile_access_grants
    (child_profile_id, source_organization_id, target_organization_id,
     granted_by_profile_id, granted_by_kind, scope)
    VALUES (v_profile_id, v_school_org_id, v_clinic_b_id, v_admin_id, 'school_admin', 'identity_only')
    RETURNING id INTO v_grant_b_id;

  -- T-11b: lying about kind → 'parent' should be denied
  v_caught := FALSE;
  BEGIN
    INSERT INTO child_profile_access_grants
      (child_profile_id, source_organization_id, target_organization_id,
       granted_by_profile_id, granted_by_kind)
      VALUES (v_profile_id, v_school_org_id, v_clinic_b_id, v_admin_id, 'parent');
  EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-11b FAILED: school_admin grant with kind=parent should be denied';
  END IF;

  -- T-11c: granted_by_profile_id != auth.uid() should be denied
  v_caught := FALSE;
  BEGIN
    INSERT INTO child_profile_access_grants
      (child_profile_id, source_organization_id, target_organization_id,
       granted_by_profile_id, granted_by_kind)
      VALUES (v_profile_id, v_school_org_id, v_clinic_b_id, v_therapist_a_uid, 'school_admin');
  EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-11c FAILED: granted_by_profile_id mismatch should be denied';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-11 PASSED: school_admin INSERT scope enforced';


  ----------------------------------------------------------------
  -- T-12  Column-guard on UPDATE
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin074@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- T-12a: try to mutate scope (immutable) → should raise
  v_caught := FALSE;
  BEGIN
    UPDATE child_profile_access_grants
       SET scope = 'identity_with_identifiers'
       WHERE id = v_grant_b_id;
  EXCEPTION WHEN raise_exception THEN v_caught := TRUE;
            WHEN OTHERS THEN
              IF SQLERRM LIKE '%immutable%' THEN v_caught := TRUE; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12a FAILED: mutating scope should be rejected by column-guard';
  END IF;

  -- T-12b: try to mutate target_organization_id → should raise
  v_caught := FALSE;
  BEGIN
    UPDATE child_profile_access_grants
       SET target_organization_id = v_clinic_a_id
       WHERE id = v_grant_b_id;
  EXCEPTION WHEN raise_exception THEN v_caught := TRUE;
            WHEN OTHERS THEN
              IF SQLERRM LIKE '%immutable%' THEN v_caught := TRUE; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12b FAILED: mutating target_organization_id should be rejected';
  END IF;

  -- T-12c: lifecycle columns mutable → should succeed
  UPDATE child_profile_access_grants
     SET valid_until = NOW() + INTERVAL '180 days',
         status = 'revoked',
         revoked_at = NOW(),
         revoked_by_profile_id = v_admin_id,
         revoke_reason = 'T-12 test'
     WHERE id = v_grant_b_id;
  SELECT status INTO v_status_after FROM child_profile_access_grants WHERE id = v_grant_b_id;
  IF v_status_after <> 'revoked' THEN
    RAISE EXCEPTION 'T-12c FAILED: lifecycle update did not persist (status=%)', v_status_after;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-12 PASSED: column-guard rejects immutable mutations, allows lifecycle';


  ----------------------------------------------------------------
  -- T-13  Documents and plans STILL hidden from clinic user despite
  --       active identity grant
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Sanity: grant is still active for clinic A from T-2/T-5
  IF NOT EXISTS (SELECT 1 FROM child_profiles WHERE id = v_profile_id) THEN
    RAISE EXCEPTION 'T-13 sanity: clinic A should still see profile via active grant';
  END IF;

  SELECT count(*) INTO v_count FROM child_documents;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: clinic A saw % child_documents (Phase 5 boundary breached)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM student_plans;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: clinic A saw % student_plans (Phase 5 boundary breached)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM students;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: clinic A saw % students', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM schools;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: clinic A saw % schools', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-13 PASSED: documents/plans/students/schools still hidden';


  ----------------------------------------------------------------
  -- T-14  child_identifiers STILL hidden — explicit retest
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM child_identifiers;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-14 FAILED: clinic saw % child_identifiers despite identity-only grant', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-14 PASSED: identifiers hidden under identity_only scope';


  ----------------------------------------------------------------
  -- T-15  ★ Phase 5A — identifier sharing via scope upgrade ★
  --
  --   T-15a  identity_only grant   → 0 child_identifiers
  --   T-15b  identity_with_identifiers grant → identifiers visible
  --   T-15c  expired grant         → 0 child_identifiers
  --   T-15d  revoked grant         → 0 child_identifiers
  --
  -- The grant from T-2 (v_grant_id) is currently active with
  -- scope='identity_only'. We use revoke-then-insert to upgrade scope
  -- (the column-guard trigger keeps `scope` immutable), then exercise
  -- expiry and revocation paths on the new grant.
  ----------------------------------------------------------------

  -- T-15a: existing identity_only grant must NOT expose identifiers.
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM child_identifiers
    WHERE child_profile_id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-15a FAILED: identity_only grant exposed % identifiers (expected 0)', v_count;
  END IF;
  RAISE NOTICE 'T-15a PASSED: identity_only grant hides identifiers';

  -- Upgrade clinic A's grant to identity_with_identifiers via the
  -- supported revoke-then-insert pattern (scope is immutable).
  RESET ROLE;
  UPDATE child_profile_access_grants
     SET status = 'revoked', revoked_at = NOW(),
         revoked_by_profile_id = v_admin_id, revoke_reason = 'T-15 upgrade'
     WHERE id = v_grant_id;
  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status,
    valid_from, valid_until
  ) VALUES (
    v_profile_id, v_school_org_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'identity_with_identifiers', 'active',
    NOW(), NOW() + INTERVAL '90 days'
  ) RETURNING id INTO v_grant_id;

  -- T-15b: with the upgraded grant, clinic A therapist sees identifiers.
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM child_identifiers
    WHERE child_profile_id = v_profile_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-15b FAILED: identity_with_identifiers grant exposed % identifiers (expected 1)', v_count;
  END IF;

  -- And the LRN value itself comes through.
  IF NOT EXISTS (
    SELECT 1 FROM child_identifiers
    WHERE child_profile_id = v_profile_id
      AND identifier_type = 'lrn'
      AND identifier_value = 'LRN-074-TEST'
  ) THEN
    RAISE EXCEPTION 'T-15b FAILED: clinic A therapist did not see the LRN row contents';
  END IF;
  RAISE NOTICE 'T-15b PASSED: identity_with_identifiers grant exposes identifiers';

  -- T-15c: expire the upgraded grant; identifiers must hide again.
  -- Same NOW()-is-frozen-in-transaction reasoning as T-6: push both
  -- valid_from and valid_until into the past, with the column-guard
  -- temporarily disabled.
  RESET ROLE;
  ALTER TABLE child_profile_access_grants DISABLE TRIGGER cpag_column_guard_trigger;
  UPDATE child_profile_access_grants
     SET valid_from  = NOW() - INTERVAL '2 hours',
         valid_until = NOW() - INTERVAL '1 hour'
     WHERE id = v_grant_id;
  ALTER TABLE child_profile_access_grants ENABLE TRIGGER cpag_column_guard_trigger;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM child_identifiers
    WHERE child_profile_id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-15c FAILED: expired grant exposed % identifiers (expected 0)', v_count;
  END IF;
  RAISE NOTICE 'T-15c PASSED: expired grant hides identifiers';

  -- T-15d: restore valid_until then revoke; identifiers must hide.
  RESET ROLE;
  UPDATE child_profile_access_grants
     SET valid_until = NOW() + INTERVAL '90 days'
     WHERE id = v_grant_id;
  UPDATE child_profile_access_grants
     SET status = 'revoked', revoked_at = NOW(),
         revoked_by_profile_id = v_admin_id, revoke_reason = 'T-15d test'
     WHERE id = v_grant_id;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-074@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM child_identifiers
    WHERE child_profile_id = v_profile_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-15d FAILED: revoked grant exposed % identifiers (expected 0)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-15d PASSED: revoked grant hides identifiers';
  RAISE NOTICE 'T-15 PASSED: identifier sharing honours scope + lifecycle';


  ----------------------------------------------------------------
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'Migration 074 smoke test: ALL SCENARIOS PASSED';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$ LANGUAGE plpgsql;

-- Discard everything we created. Change to COMMIT to inspect rows.
ROLLBACK;

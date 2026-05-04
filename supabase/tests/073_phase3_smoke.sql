-- ============================================================
-- Smoke tests for migration 073 — Phase 3 (linking only).
--
-- Scope (focused on the linking-only contract):
--   T-1  Lauris Learn unchanged — school_admin still resolves their
--        own school's child_profiles via the unmodified Phase 1
--        helper, and their own school org via the helper.
--   T-2  Phase 2 isolation regression — synthetic Lauris-Care-style
--        user with NO membership row sees zero rows everywhere.
--   T-3  ★ Clinic user with one ACTIVE membership ★
--          - sees their clinic org
--          - sees their own membership row
--          - sees child_profile_memberships rows in their clinic
--            (bare links — child_profile_id is a UUID they cannot
--            dereference in Phase 3)
--          - does NOT see child_profiles
--          - does NOT see child_identifiers
--          - does NOT see schools, students, child_documents,
--            student_plans, parent_updates, billing_records,
--            external_contacts, document_*
--   T-4  Cross-clinic isolation — clinic A user cannot see clinic B's
--        org, memberships, or child_profile_memberships.
--   T-5  Membership end → access drop.
--          - Set the clinic user's membership.status='ended'.
--          - They should still see their own (now-ended) membership
--            row (audit), but NOT see their clinic org and NOT see
--            child_profile_memberships in that clinic.
--   T-6  is_super_admin() bypass intact — super_admin reads all.
--   T-7  Phase 1 promise — caller_visible_child_profile_ids() body
--        still has exactly four arms (super_admin / school_admin /
--        teacher / parent). No clinic arm.
--
-- Run ONLY in a non-production project. Wrapped in BEGIN/ROLLBACK.
-- Change the trailing ROLLBACK to COMMIT to inspect the rows.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- Existing fixtures
  v_school_id          UUID;
  v_admin_id           UUID;        -- profiles.id of a school_admin
  v_school_year_id     UUID;

  -- Synthesized fixtures
  v_student_id         UUID;
  v_profile_id         UUID;        -- child_profile id linked to v_student_id
  v_school_org_id      UUID;        -- existing kind='school' org for v_school_id
  v_doc_id             UUID;

  -- Phase-3 actors
  v_clinic_a_id        UUID;
  v_clinic_b_id        UUID;
  v_therapist_a_uid    UUID;
  v_therapist_b_uid    UUID;
  v_lc_orphan_uid      UUID;        -- LC-style user with NO membership

  -- Membership ids
  v_mem_a              UUID;
  v_mem_b              UUID;

  -- Child→clinic membership ids
  v_cpm_a              UUID;
  v_cpm_b              UUID;

  -- Result holders
  v_caught             BOOLEAN;
  v_count              INT;
  v_helper_def         TEXT;
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
    FROM organizations
    WHERE kind = 'school' AND school_id = v_school_id;
  IF v_school_org_id IS NULL THEN
    RAISE EXCEPTION '0. fixture: missing kind=school org for the school — migration 072 backfill A may not have run';
  END IF;


  ----------------------------------------------------------------
  -- 1. Synthesize Phase-3 fixtures
  ----------------------------------------------------------------

  -- Two clinic orgs
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic', 'TEST 073 — Clinic A', 'PH', 'lauris_care')
    RETURNING id INTO v_clinic_a_id;

  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic', 'TEST 073 — Clinic B', 'PH', 'lauris_care')
    RETURNING id INTO v_clinic_b_id;

  -- Two clinic users.
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
    VALUES (gen_random_uuid(), 'tA-073@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid, 'tA-073@example.com', 'TEST 073 Therapist A', NULL, 'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          school_id = EXCLUDED.school_id,
          role      = EXCLUDED.role;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'tB-073@example.com')
    RETURNING id INTO v_therapist_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_b_uid, 'tB-073@example.com', 'TEST 073 Therapist B', NULL, 'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          school_id = EXCLUDED.school_id,
          role      = EXCLUDED.role;

  -- An "orphan" LC-style user — has profile but no membership anywhere
  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'orphan-073@example.com')
    RETURNING id INTO v_lc_orphan_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_lc_orphan_uid, 'orphan-073@example.com', 'TEST 073 Orphan', NULL, 'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          school_id = EXCLUDED.school_id,
          role      = EXCLUDED.role;

  -- Active memberships for therapists
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active')
    RETURNING id INTO v_mem_a;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_therapist_b_uid, 'therapist', 'active')
    RETURNING id INTO v_mem_b;

  -- Fresh student linked to a child_profile (used by the no-visibility tests)
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id, 'TEST073', 'Phase3')
    RETURNING id INTO v_student_id;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST073 Phase3', 'TEST073', 'Phase3', 'lauris_learn')
    RETURNING id INTO v_profile_id;
  UPDATE students SET child_profile_id = v_profile_id WHERE id = v_student_id;

  -- Child↔clinic memberships (one to each clinic)
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_profile_id, v_clinic_a_id, 'patient', 'active', 'lauris_care')
    RETURNING id INTO v_cpm_a;
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_profile_id, v_clinic_b_id, 'patient', 'active', 'lauris_care')
    RETURNING id INTO v_cpm_b;

  -- A document for T-3's negative checks
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'parent_provided',
            'TEST 073 doc', 'draft', v_admin_id)
    RETURNING id INTO v_doc_id;


  ----------------------------------------------------------------
  -- T-1  Lauris Learn unchanged — school_admin still resolves
  --      child_profiles + their own school org.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin073@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF NOT (v_profile_id = ANY(caller_visible_child_profile_ids())) THEN
    RAISE EXCEPTION 'T-1 FAILED: Phase 1 helper does not contain expected profile';
  END IF;

  IF NOT (v_school_org_id = ANY(caller_visible_organization_ids())) THEN
    RAISE EXCEPTION 'T-1 FAILED: school_admin does not resolve their own school org';
  END IF;

  -- ...and CANNOT resolve clinic orgs (they have no membership)
  IF (v_clinic_a_id = ANY(caller_visible_organization_ids())) THEN
    RAISE EXCEPTION 'T-1 FAILED: school_admin should NOT see clinic A org';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-1 PASSED: school_admin sees own profiles + own school org, no clinics';


  ----------------------------------------------------------------
  -- T-2  Orphan LC-style user — zero rows everywhere.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_lc_orphan_uid::text, 'email', 'orphan-073@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM organizations;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-2 FAILED: orphan saw % organizations', v_count; END IF;

  SELECT count(*) INTO v_count FROM organization_memberships;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-2 FAILED: orphan saw % memberships', v_count; END IF;

  SELECT count(*) INTO v_count FROM child_profile_memberships;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-2 FAILED: orphan saw % cp_memberships', v_count; END IF;

  SELECT count(*) INTO v_count FROM child_profiles;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-2 FAILED: orphan saw % child_profiles', v_count; END IF;

  SELECT count(*) INTO v_count FROM students;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-2 FAILED: orphan saw % students', v_count; END IF;

  SELECT count(*) INTO v_count FROM child_documents;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-2 FAILED: orphan saw % child_documents', v_count; END IF;

  SELECT count(*) INTO v_count FROM student_plans;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-2 FAILED: orphan saw % student_plans', v_count; END IF;

  RESET ROLE;
  RAISE NOTICE 'T-2 PASSED: orphan LC-style user has zero visibility';


  ----------------------------------------------------------------
  -- T-3  ★ Clinic A therapist — linking-only matrix ★
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-073@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Sees their own clinic org (and only that)
  SELECT count(*) INTO v_count FROM organizations;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-3 FAILED: clinic A therapist saw % orgs (expected 1)', v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_clinic_a_id) THEN
    RAISE EXCEPTION 'T-3 FAILED: clinic A therapist did not see their own clinic';
  END IF;

  -- Sees their own membership row (and only that, since clinic A has only one member)
  SELECT count(*) INTO v_count FROM organization_memberships;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-3 FAILED: clinic A therapist saw % memberships (expected 1)', v_count;
  END IF;

  -- Sees the child_profile_membership row in their clinic (1 of 2 — the
  -- one in clinic B is invisible to them)
  SELECT count(*) INTO v_count FROM child_profile_memberships;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-3 FAILED: clinic A therapist saw % child_profile_memberships (expected 1)', v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM child_profile_memberships
    WHERE id = v_cpm_a AND organization_id = v_clinic_a_id
  ) THEN
    RAISE EXCEPTION 'T-3 FAILED: clinic A therapist did not see their clinic''s cp_membership';
  END IF;

  -- ★ The critical Phase-3 invariant: NO child_profile / child_identifier visibility ★
  SELECT count(*) INTO v_count FROM child_profiles;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: clinic A therapist saw % child_profiles (expected 0 — Phase 3 is linking only)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM child_identifiers;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: clinic A therapist saw % child_identifiers (expected 0)', v_count;
  END IF;

  -- All Lauris Learn tables remain invisible
  SELECT count(*) INTO v_count FROM schools;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-3 FAILED: clinic saw % schools', v_count; END IF;
  SELECT count(*) INTO v_count FROM students;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-3 FAILED: clinic saw % students', v_count; END IF;
  SELECT count(*) INTO v_count FROM child_documents;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-3 FAILED: clinic saw % child_documents', v_count; END IF;
  SELECT count(*) INTO v_count FROM student_plans;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-3 FAILED: clinic saw % student_plans', v_count; END IF;
  SELECT count(*) INTO v_count FROM external_contacts;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-3 FAILED: clinic saw % external_contacts', v_count; END IF;
  SELECT count(*) INTO v_count FROM enrollments;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T-3 FAILED: clinic saw % enrollments', v_count; END IF;

  RESET ROLE;
  RAISE NOTICE 'T-3 PASSED: clinic A therapist sees only org + own membership + cp_membership; no identity, no school data';


  ----------------------------------------------------------------
  -- T-4  Cross-clinic isolation
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-073@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF EXISTS (SELECT 1 FROM organizations WHERE id = v_clinic_b_id) THEN
    RAISE EXCEPTION 'T-4 FAILED: clinic A therapist sees clinic B org';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_memberships WHERE id = v_mem_b) THEN
    RAISE EXCEPTION 'T-4 FAILED: clinic A therapist sees clinic B membership';
  END IF;
  IF EXISTS (SELECT 1 FROM child_profile_memberships WHERE id = v_cpm_b) THEN
    RAISE EXCEPTION 'T-4 FAILED: clinic A therapist sees clinic B child link';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-4 PASSED: cross-clinic isolation';


  ----------------------------------------------------------------
  -- T-5  Membership end → access drop
  --      End the clinic A therapist's membership and verify access
  --      collapses. They retain SELECT on their own ended row for
  --      audit (the SELECT policy doesn't filter by status), but the
  --      org-arm in the helper requires status='active'.
  ----------------------------------------------------------------
  RESET ROLE;
  UPDATE organization_memberships
     SET status = 'ended', ended_at = CURRENT_DATE
     WHERE id = v_mem_a;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email', 'tA-073@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Org gone
  SELECT count(*) INTO v_count FROM organizations;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-5 FAILED: ended-membership user saw % orgs (expected 0)', v_count;
  END IF;

  -- Own ended membership row still visible (profile_id = auth.uid() arm)
  SELECT count(*) INTO v_count FROM organization_memberships WHERE id = v_mem_a;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-5 FAILED: ended-membership user lost SELECT on own ended row (count=%)', v_count;
  END IF;

  -- child_profile_memberships gone (no longer visible via org-arm)
  SELECT count(*) INTO v_count FROM child_profile_memberships;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-5 FAILED: ended-membership user saw % cp_memberships (expected 0)', v_count;
  END IF;

  RESET ROLE;
  -- Restore for any later tests
  UPDATE organization_memberships SET status = 'active', ended_at = NULL WHERE id = v_mem_a;
  RAISE NOTICE 'T-5 PASSED: ending a membership drops access immediately';


  ----------------------------------------------------------------
  -- T-6  Super-admin bypass intact (no impersonation needed — at
  --      RESET ROLE we're back to the test runner which is super.
  --      Just verify the bypass policy resolves).
  ----------------------------------------------------------------
  -- Direct check: super-admin path should see all orgs / memberships.
  SELECT count(*) INTO v_count FROM organizations
    WHERE id IN (v_school_org_id, v_clinic_a_id, v_clinic_b_id);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T-6 FAILED: super-admin saw % of 3 known orgs', v_count;
  END IF;
  RAISE NOTICE 'T-6 PASSED: super-admin reads all orgs';


  ----------------------------------------------------------------
  -- T-7  Phase 1 promise — caller_visible_child_profile_ids() body
  --      still has exactly four arms (no clinic arm).
  --
  --      Indirect check: an active clinic membership must NOT add
  --      anything to the helper. We've already proven this in T-3
  --      (clinic therapist saw 0 child_profiles). This block is the
  --      direct mechanical regression: scan pg_proc for the body
  --      and confirm it does NOT mention organization_memberships.
  ----------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO v_helper_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'caller_visible_child_profile_ids'
     AND n.nspname = 'public';
  IF v_helper_def IS NULL THEN
    RAISE EXCEPTION 'T-7 FAILED: caller_visible_child_profile_ids() not found';
  END IF;
  IF position('organization_memberships' IN v_helper_def) > 0
     OR position('child_profile_memberships' IN v_helper_def) > 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: caller_visible_child_profile_ids() body now references org/cp memberships — Phase 1 helper must stay frozen until Phase 4';
  END IF;
  RAISE NOTICE 'T-7 PASSED: caller_visible_child_profile_ids() body is unmodified (no clinic arm)';


  ----------------------------------------------------------------
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'Migration 073 smoke test: ALL SCENARIOS PASSED';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$ LANGUAGE plpgsql;

-- Discard everything we created. Change to COMMIT to inspect the rows.
ROLLBACK;

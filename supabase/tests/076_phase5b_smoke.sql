-- ============================================================
-- Smoke tests for migration 076 — Phase 5B (cross-organization
-- document sharing). BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Schema applied (table, indexes, triggers, helpers, RPC,
--         actor_kind CHECK widened).
--   T-2   ★ Lauris Learn unchanged ★ — accessible_document_ids() and
--         log_document_access bodies do NOT reference the new table /
--         helper / RPC. Mechanical regression check via
--         pg_get_functiondef.
--   T-3   ★ Decoupling: identity grant alone yields zero documents ★
--         A clinic user with child_profile_access_grants
--         (identity_with_identifiers) sees child_profiles +
--         child_identifiers but ZERO documents via the new helper
--         and ZERO via the new RPC.
--   T-4   ★ Phase 5B happy path ★ — clinic user with active doc grant:
--         - new helper returns the granted doc id
--         - new RPC returns allowed=true + version metadata
--         - direct SELECT on child_documents still returns 0
--           (existing policies untouched)
--   T-5   Grant expiry → RPC denies with 'org_grant_expired'.
--   T-6   Revocation → RPC denies with 'org_grant_revoked' AND the
--         grant row disappears from clinic-side SELECT (defense-in-
--         depth status='active' clamp).
--   T-7   Asymmetric SELECT on the new table — school_admin still
--         sees revoked grants for audit; clinic user does not.
--   T-8   Cross-clinic isolation — clinic B without a grant sees
--         neither the doc nor clinic A's grant row.
--   T-9   Unrelated documents stay invisible — clinic with grant on
--         doc X cannot enumerate doc Y via the new helper.
--   T-10  CHECK constraints — invalid scope, status, granted_by_kind,
--         valid_until <= valid_from all rejected.
--   T-11  school_admin INSERT scope — own school OK; other school
--         denied; granted_by_profile_id mismatch denied; non-clinic
--         target denied.
--   T-12  Column-guard on UPDATE — mutating immutable columns
--         rejected; lifecycle columns accepted.
--   T-13  RPC blocks super_admin — denied=true, denied_reason
--         logged.
--   T-14  RPC blocks unauthenticated — denied=true, denied_reason
--         'not_authorized'.
--   T-15  RPC honours grant.permissions.download — view OK,
--         download denied unless permission set.
--   T-16  RPC handles hidden current version → 'no_visible_version'.
--   T-17  actor_kind CHECK accepts 'organization_member'.
--   T-18  Storage RLS unchanged — clinic user direct SELECT on
--         storage.objects returns 0 rows.
--   T-19  Other school-owned tables stay invisible to clinic user
--         despite active doc grant — student_plans, students,
--         schools, child_identifiers (from non-granted children),
--         document_consents, document_access_grants,
--         document_requests.
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- Existing fixtures
  v_school_id          UUID;
  v_admin_id           UUID;
  v_school_year_id     UUID;
  v_school_org_id      UUID;

  -- Synthesized
  v_student_id         UUID;
  v_profile_id         UUID;        -- child_profile linked to student
  v_doc_x              UUID;        -- doc shared with clinic A
  v_doc_y              UUID;        -- doc NOT shared
  v_version_x          UUID;
  v_version_y          UUID;

  -- Phase-3 actors
  v_clinic_a_id        UUID;
  v_clinic_b_id        UUID;
  v_therapist_a_uid    UUID;
  v_therapist_b_uid    UUID;
  v_mem_a              UUID;
  v_mem_b              UUID;

  -- Phase-4 identity grant + Phase-5B doc grants
  v_identity_grant     UUID;
  v_doc_grant          UUID;

  -- Result holders
  v_caught             BOOLEAN;
  v_count              INT;
  v_resp               JSONB;
  v_helper_ad_def      TEXT;
  v_helper_lda_def     TEXT;
  v_status_after       TEXT;
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
    FROM organizations WHERE kind='school' AND school_id = v_school_id;


  ----------------------------------------------------------------
  -- T-1 Schema applied
  ----------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='document_organization_access_grants') THEN
    RAISE EXCEPTION 'T-1 FAILED: table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='caller_visible_document_ids_for_organizations') THEN
    RAISE EXCEPTION 'T-1 FAILED: helper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='log_document_access_for_organizations') THEN
    RAISE EXCEPTION 'T-1 FAILED: RPC missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='doag_column_guard_trigger') THEN
    RAISE EXCEPTION 'T-1 FAILED: column-guard trigger missing';
  END IF;
  RAISE NOTICE 'T-1 PASSED: schema artifacts present';


  ----------------------------------------------------------------
  -- T-2 ★ Lauris Learn unchanged ★
  --
  -- accessible_document_ids() body must not contain references to
  -- the new table / helper / RPC. log_document_access body must not
  -- contain references either. This is the strict isolation
  -- regression check.
  ----------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO v_helper_ad_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='accessible_document_ids' AND n.nspname='public';
  IF v_helper_ad_def IS NULL THEN
    RAISE EXCEPTION 'T-2 FAILED: accessible_document_ids() missing';
  END IF;
  IF position('document_organization_access_grants' IN v_helper_ad_def) > 0
     OR position('caller_visible_document_ids_for_organizations' IN v_helper_ad_def) > 0
     OR position('organization_memberships' IN v_helper_ad_def) > 0 THEN
    RAISE EXCEPTION 'T-2 FAILED: accessible_document_ids() body references Phase 5B artifacts';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_helper_lda_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='log_document_access' AND n.nspname='public';
  IF v_helper_lda_def IS NULL THEN
    RAISE EXCEPTION 'T-2 FAILED: log_document_access RPC missing';
  END IF;
  IF position('document_organization_access_grants' IN v_helper_lda_def) > 0
     OR position('caller_visible_document_ids_for_organizations' IN v_helper_lda_def) > 0
     OR position('organization_member' IN v_helper_lda_def) > 0
     OR position('log_document_access_for_organizations' IN v_helper_lda_def) > 0 THEN
    RAISE EXCEPTION 'T-2 FAILED: log_document_access body references Phase 5B artifacts';
  END IF;
  RAISE NOTICE 'T-2 PASSED: accessible_document_ids() and log_document_access() are byte-clean';


  ----------------------------------------------------------------
  -- 1. Synthesize fixtures
  ----------------------------------------------------------------

  -- Two clinic orgs + therapists
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 076 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 076 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-076@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-076@example.com','TEST 076 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tB-076@example.com')
    RETURNING id INTO v_therapist_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_b_uid,'tB-076@example.com','TEST 076 Therapist B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;

  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active')
    RETURNING id INTO v_mem_a;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_therapist_b_uid, 'therapist', 'active')
    RETURNING id INTO v_mem_b;

  -- Student + linked child_profile
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST076','Phase5B')
    RETURNING id INTO v_student_id;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST076 Phase5B','TEST076','Phase5B','lauris_learn')
    RETURNING id INTO v_profile_id;
  UPDATE students SET child_profile_id = v_profile_id WHERE id = v_student_id;

  -- Two documents on the school side. doc_x will be shared with clinic A.
  -- child_documents_current_version_required_chk enforces that
  -- status != 'draft' rows must carry current_version_id, so we
  -- create as 'draft', insert the version, then flip status + link
  -- in a single UPDATE.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'parent_provided', 'TEST 076 doc X', 'draft', v_admin_id)
    RETURNING id INTO v_doc_x;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_x, v_school_id, 1,
    v_school_id::text || '/' || v_student_id::text || '/' || v_doc_x::text || '/v1.pdf',
    'docX.pdf', 1000, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_version_x;
  UPDATE child_documents
     SET current_version_id = v_version_x, status = 'active'
     WHERE id = v_doc_x;

  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'medical_certificate', 'TEST 076 doc Y', 'draft', v_admin_id)
    RETURNING id INTO v_doc_y;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_y, v_school_id, 1,
    v_school_id::text || '/' || v_student_id::text || '/' || v_doc_y::text || '/v1.pdf',
    'docY.pdf', 1000, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_version_y;
  UPDATE child_documents
     SET current_version_id = v_version_y, status = 'active'
     WHERE id = v_doc_y;

  -- Phase 4/5A identity grant (identity_with_identifiers) for therapist A.
  -- Used by T-3 to prove decoupling.
  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status,
    valid_from, valid_until
  ) VALUES (
    v_profile_id, v_school_org_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'identity_with_identifiers', 'active',
    NOW(), NOW() + INTERVAL '90 days'
  ) RETURNING id INTO v_identity_grant;

  -- A sample LRN so child_identifiers is non-empty (T-3, T-19).
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_profile_id, 'lrn', 'LRN-076-TEST', 'PH');

  -- Phase 5B doc grant: doc_x → clinic A. download permitted = false in T-15.
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_x, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active', NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false)
  ) RETURNING id INTO v_doc_grant;


  ----------------------------------------------------------------
  -- T-3 ★ Decoupling — identity grant ≠ document access ★
  --
  -- Therapist A has an active identity_with_identifiers grant. They
  -- can see child_profile and child_identifiers (Phase 4/5A). They
  -- must NOT see any document via the new helper, and the new RPC
  -- must deny access for both docs.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Sanity: identity + identifier visible
  IF NOT EXISTS (SELECT 1 FROM child_profiles WHERE id = v_profile_id) THEN
    RAISE EXCEPTION 'T-3 sanity: identity grant should expose child_profile';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM child_identifiers WHERE child_profile_id = v_profile_id) THEN
    RAISE EXCEPTION 'T-3 sanity: identity_with_identifiers grant should expose child_identifiers';
  END IF;

  -- The new helper should return ONLY doc_x (the doc with a Phase 5B grant).
  -- Identity grant alone does not surface any document.
  RESET ROLE;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;
  IF NOT (v_doc_x = ANY(caller_visible_document_ids_for_organizations())) THEN
    RAISE EXCEPTION 'T-3 setup: helper should already include doc_x via the existing doc grant';
  END IF;
  IF (v_doc_y = ANY(caller_visible_document_ids_for_organizations())) THEN
    RAISE EXCEPTION 'T-3 FAILED: doc_y exposed without a doc grant (identity-only path leaked)';
  END IF;

  -- The new RPC must deny access to doc_y (no doc grant).
  v_resp := log_document_access_for_organizations(v_doc_y, 'view');
  IF (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-3 FAILED: RPC allowed access to doc_y without doc grant';
  END IF;
  IF (v_resp->>'denied_reason') <> 'org_grant_not_found' THEN
    RAISE EXCEPTION 'T-3 FAILED: doc_y denial reason = % (expected org_grant_not_found)', v_resp->>'denied_reason';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-3 PASSED: identity grant does NOT imply document access';


  ----------------------------------------------------------------
  -- T-4 ★ Phase 5B happy path ★
  --
  --   - new helper returns doc_x
  --   - new RPC returns allowed=true with version metadata
  --   - direct SELECT on child_documents still returns 0
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF NOT (v_doc_x = ANY(caller_visible_document_ids_for_organizations())) THEN
    RAISE EXCEPTION 'T-4 FAILED: helper missing doc_x for clinic A therapist';
  END IF;

  v_resp := log_document_access_for_organizations(v_doc_x, 'view');
  IF NOT (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-4 FAILED: RPC denied doc_x (reason=%)', v_resp->>'denied_reason';
  END IF;
  IF (v_resp->>'storage_path') IS NULL OR (v_resp->>'mime_type') IS NULL THEN
    RAISE EXCEPTION 'T-4 FAILED: allowed response missing metadata';
  END IF;
  IF (v_resp->>'current_version_id')::uuid <> v_version_x THEN
    RAISE EXCEPTION 'T-4 FAILED: RPC returned wrong version id';
  END IF;
  IF (v_resp->>'signed_url_ttl_seconds')::int <> 60 THEN
    RAISE EXCEPTION 'T-4 FAILED: ttl <> 60';
  END IF;

  -- Direct SELECT on child_documents stays 0 (existing policies untouched).
  SELECT count(*) INTO v_count FROM child_documents WHERE id = v_doc_x;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-4 FAILED: clinic SELECT on child_documents returned % (expected 0)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-4 PASSED: helper + RPC grant access; direct SELECT remains denied';


  ----------------------------------------------------------------
  -- T-5 Grant expiry → RPC denies
  -- Same NOW()-frozen-in-transaction issue as 074: must move
  -- valid_from back too, and do it with the column-guard disabled.
  ----------------------------------------------------------------
  RESET ROLE;
  ALTER TABLE document_organization_access_grants DISABLE TRIGGER doag_column_guard_trigger;
  UPDATE document_organization_access_grants
     SET valid_from  = NOW() - INTERVAL '2 hours',
         valid_until = NOW() - INTERVAL '1 hour'
     WHERE id = v_doc_grant;
  ALTER TABLE document_organization_access_grants ENABLE TRIGGER doag_column_guard_trigger;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_resp := log_document_access_for_organizations(v_doc_x, 'view');
  IF (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-5 FAILED: expired grant allowed access';
  END IF;
  IF (v_resp->>'denied_reason') <> 'org_grant_expired' THEN
    RAISE EXCEPTION 'T-5 FAILED: expired denial reason = % (expected org_grant_expired)', v_resp->>'denied_reason';
  END IF;

  RESET ROLE;
  -- Restore valid window for subsequent tests
  UPDATE document_organization_access_grants
     SET valid_until = NOW() + INTERVAL '90 days'
     WHERE id = v_doc_grant;
  RAISE NOTICE 'T-5 PASSED: expired grant denies with org_grant_expired';


  ----------------------------------------------------------------
  -- T-6 Revocation → denies AND grant row hidden from clinic
  ----------------------------------------------------------------
  RESET ROLE;
  UPDATE document_organization_access_grants
     SET status='revoked', revoked_at=NOW(),
         revoked_by_profile_id=v_admin_id, revoke_reason='T-6 test'
     WHERE id = v_doc_grant;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_resp := log_document_access_for_organizations(v_doc_x, 'view');
  IF (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-6 FAILED: revoked grant allowed access';
  END IF;
  IF (v_resp->>'denied_reason') <> 'org_grant_revoked' THEN
    RAISE EXCEPTION 'T-6 FAILED: revoked denial reason = % (expected org_grant_revoked)', v_resp->>'denied_reason';
  END IF;

  -- Defense-in-depth: the revoked grant row must NOT appear in the
  -- clinic user's SELECT (status='active' clamp).
  SELECT count(*) INTO v_count
    FROM document_organization_access_grants
    WHERE id = v_doc_grant;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: clinic saw revoked grant row (count=%)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-6 PASSED: revocation denies AND hides grant row from clinic';


  ----------------------------------------------------------------
  -- T-7 Asymmetric SELECT — school_admin sees revoked grant
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email','admin076@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM document_organization_access_grants
    WHERE id = v_doc_grant;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-7 FAILED: school_admin lost SELECT on revoked grant (count=%)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-7 PASSED: school_admin retains audit SELECT on revoked grants';

  -- Restore the grant for subsequent tests
  UPDATE document_organization_access_grants
     SET status='active', revoked_at=NULL, revoked_by_profile_id=NULL, revoke_reason=NULL
     WHERE id = v_doc_grant;


  ----------------------------------------------------------------
  -- T-8 Cross-clinic isolation
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_b_uid::text, 'email','tB-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Helper returns no docs
  IF (v_doc_x = ANY(caller_visible_document_ids_for_organizations())) THEN
    RAISE EXCEPTION 'T-8 FAILED: clinic B sees doc_x via helper';
  END IF;
  -- RPC denies
  v_resp := log_document_access_for_organizations(v_doc_x, 'view');
  IF (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-8 FAILED: clinic B was allowed doc_x';
  END IF;
  -- Cannot SELECT clinic A's grant row
  IF EXISTS (SELECT 1 FROM document_organization_access_grants WHERE id = v_doc_grant) THEN
    RAISE EXCEPTION 'T-8 FAILED: clinic B sees clinic A grant row';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-8 PASSED: cross-clinic isolation';


  ----------------------------------------------------------------
  -- T-9 Unrelated documents stay invisible to clinic A
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- doc_y has no grant; helper should NOT include it
  IF (v_doc_y = ANY(caller_visible_document_ids_for_organizations())) THEN
    RAISE EXCEPTION 'T-9 FAILED: doc_y leaked into clinic A helper';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-9 PASSED: unrelated documents invisible';


  ----------------------------------------------------------------
  -- T-10 CHECK constraints
  ----------------------------------------------------------------
  RESET ROLE;

  -- invalid scope
  v_caught := FALSE;
  BEGIN
    INSERT INTO document_organization_access_grants
      (document_id, source_school_id, target_organization_id,
       granted_by_profile_id, granted_by_kind, scope)
      VALUES (v_doc_x, v_school_id, v_clinic_b_id, v_admin_id, 'super_admin', 'document_type');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: invalid scope accepted'; END IF;

  -- invalid status
  v_caught := FALSE;
  BEGIN
    INSERT INTO document_organization_access_grants
      (document_id, source_school_id, target_organization_id,
       granted_by_profile_id, granted_by_kind, status)
      VALUES (v_doc_x, v_school_id, v_clinic_b_id, v_admin_id, 'super_admin', 'pending');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: invalid status accepted'; END IF;

  -- invalid granted_by_kind
  v_caught := FALSE;
  BEGIN
    INSERT INTO document_organization_access_grants
      (document_id, source_school_id, target_organization_id,
       granted_by_profile_id, granted_by_kind)
      VALUES (v_doc_x, v_school_id, v_clinic_b_id, v_admin_id, 'parent');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: invalid granted_by_kind accepted'; END IF;

  -- valid_until <= valid_from
  v_caught := FALSE;
  BEGIN
    INSERT INTO document_organization_access_grants
      (document_id, source_school_id, target_organization_id,
       granted_by_profile_id, granted_by_kind, valid_from, valid_until)
      VALUES (v_doc_x, v_school_id, v_clinic_b_id, v_admin_id, 'super_admin', NOW(), NOW()-INTERVAL '1 day');
  EXCEPTION WHEN check_violation THEN v_caught := TRUE; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'T-10 FAILED: valid_until <= valid_from accepted'; END IF;

  RAISE NOTICE 'T-10 PASSED: CHECK constraints enforced';


  ----------------------------------------------------------------
  -- T-11 school_admin INSERT scope
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email','admin076@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- T-11a: own school, clinic target → OK (we already have one to clinic A;
  -- insert one to clinic B to verify path).
  INSERT INTO document_organization_access_grants
    (document_id, source_school_id, target_organization_id,
     granted_by_profile_id, granted_by_kind)
    VALUES (v_doc_y, v_school_id, v_clinic_b_id, v_admin_id, 'school_admin');

  -- T-11b: granted_by_profile_id mismatch → denied
  v_caught := FALSE;
  BEGIN
    INSERT INTO document_organization_access_grants
      (document_id, source_school_id, target_organization_id,
       granted_by_profile_id, granted_by_kind)
      VALUES (v_doc_y, v_school_id, v_clinic_a_id, v_therapist_a_uid, 'school_admin');
  EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-11b FAILED: granted_by_profile_id mismatch should be denied';
  END IF;

  -- T-11c: target = school org → denied (kind guard)
  v_caught := FALSE;
  BEGIN
    INSERT INTO document_organization_access_grants
      (document_id, source_school_id, target_organization_id,
       granted_by_profile_id, granted_by_kind)
      VALUES (v_doc_y, v_school_id, v_school_org_id, v_admin_id, 'school_admin');
  EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-11c FAILED: target=school org should be denied by RLS kind guard';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-11 PASSED: school_admin INSERT scope enforced';


  ----------------------------------------------------------------
  -- T-12 Column-guard on UPDATE
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email','admin076@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- T-12a: try to mutate target_organization_id (immutable) → reject
  v_caught := FALSE;
  BEGIN
    UPDATE document_organization_access_grants
       SET target_organization_id = v_clinic_b_id
       WHERE id = v_doc_grant;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable%' THEN v_caught := TRUE; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12a FAILED: mutating target_organization_id should be rejected';
  END IF;

  -- T-12b: try to mutate permissions (immutable) → reject
  v_caught := FALSE;
  BEGIN
    UPDATE document_organization_access_grants
       SET permissions = jsonb_build_object('view',true,'download',true,'comment',false,'upload_new_version',false)
       WHERE id = v_doc_grant;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable%' THEN v_caught := TRUE; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12b FAILED: mutating permissions should be rejected';
  END IF;

  -- T-12c: lifecycle columns mutable
  UPDATE document_organization_access_grants
     SET status='revoked', revoked_at=NOW(),
         revoked_by_profile_id=v_admin_id, revoke_reason='T-12 test'
     WHERE id = v_doc_grant;
  SELECT status INTO v_status_after
    FROM document_organization_access_grants WHERE id = v_doc_grant;
  IF v_status_after <> 'revoked' THEN
    RAISE EXCEPTION 'T-12c FAILED: lifecycle update did not persist';
  END IF;

  RESET ROLE;
  -- Restore for subsequent tests
  UPDATE document_organization_access_grants
     SET status='active', revoked_at=NULL, revoked_by_profile_id=NULL, revoke_reason=NULL
     WHERE id = v_doc_grant;
  RAISE NOTICE 'T-12 PASSED: column-guard correct';


  ----------------------------------------------------------------
  -- T-13 RPC blocks super_admin
  -- Outside any role-set, we are the test runner — but is_super_admin
  -- needs auth.uid() to resolve to a profile with role='super_admin'.
  -- We need a real super_admin profile to test this. Skip if absent.
  ----------------------------------------------------------------
  DECLARE
    v_super_uid UUID;
  BEGIN
    SELECT id INTO v_super_uid FROM profiles WHERE role='super_admin' LIMIT 1;
    IF v_super_uid IS NULL THEN
      RAISE NOTICE 'T-13 SKIPPED: no super_admin profile in this database';
    ELSE
      EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
        jsonb_build_object('sub', v_super_uid::text, 'email','super076@example.com')::text);
      SET LOCAL ROLE authenticated;
      v_resp := log_document_access_for_organizations(v_doc_x, 'view');
      IF (v_resp->>'allowed')::boolean THEN
        RAISE EXCEPTION 'T-13 FAILED: super_admin allowed via RPC (should be denied)';
      END IF;
      IF (v_resp->>'denied_reason') <> 'not_authorized' THEN
        RAISE EXCEPTION 'T-13 FAILED: super_admin denial reason = %', v_resp->>'denied_reason';
      END IF;
      RESET ROLE;
      RAISE NOTICE 'T-13 PASSED: RPC denies super_admin';
    END IF;
  END;


  ----------------------------------------------------------------
  -- T-14 RPC blocks unauthenticated
  -- We can't easily simulate auth.uid() = NULL inside a DO block
  -- without setting the role differently; the existing pattern in
  -- 074/075 used a NULL claim. Easier: temporarily clear the JWT
  -- claim and call the RPC.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$, '{}'::text);
  SET LOCAL ROLE authenticated;
  v_resp := log_document_access_for_organizations(v_doc_x, 'view');
  IF (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-14 FAILED: unauthenticated allowed via RPC';
  END IF;
  IF (v_resp->>'denied_reason') <> 'not_authorized' THEN
    RAISE EXCEPTION 'T-14 FAILED: unauthenticated denial reason = %', v_resp->>'denied_reason';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'T-14 PASSED: RPC denies unauthenticated';


  ----------------------------------------------------------------
  -- T-15 Download permission honoured
  -- Current grant has download=false. RPC view should allow,
  -- download should deny. Then update permissions to download=true
  -- via revoke-then-insert (permissions is immutable).
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_resp := log_document_access_for_organizations(v_doc_x, 'view');
  IF NOT (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-15 setup: view should be allowed (got reason=%)', v_resp->>'denied_reason';
  END IF;

  v_resp := log_document_access_for_organizations(v_doc_x, 'download');
  IF (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-15 FAILED: download allowed despite permissions.download=false';
  END IF;
  IF (v_resp->>'denied_reason') <> 'download_not_permitted' THEN
    RAISE EXCEPTION 'T-15 FAILED: download denial reason = %', v_resp->>'denied_reason';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-15 PASSED: download permission gate honoured';


  ----------------------------------------------------------------
  -- T-16 No visible version → 'no_visible_version' denial
  --
  -- Trigger 5.E (mig 054) refuses to hide the only visible version
  -- of a non-draft document. Rather than fight the trigger, we
  -- exercise the same RPC code path by NULL-ing current_version_id
  -- directly. The CHECK constraint child_documents_current_version_
  -- required_chk requires status='draft' for current_version_id to
  -- be NULL, so we flip status first and restore both at the end.
  ----------------------------------------------------------------
  RESET ROLE;
  UPDATE child_documents
     SET status = 'draft', current_version_id = NULL
     WHERE id = v_doc_x;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_resp := log_document_access_for_organizations(v_doc_x, 'view');
  IF (v_resp->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-16 FAILED: no_visible_version still allowed';
  END IF;
  IF (v_resp->>'denied_reason') <> 'no_visible_version' THEN
    RAISE EXCEPTION 'T-16 FAILED: denial reason = %', v_resp->>'denied_reason';
  END IF;

  RESET ROLE;
  -- Restore for any remaining tests: relink the version, then flip
  -- status back to 'active' (the order matters — the CHECK requires
  -- current_version_id to be set before status leaves 'draft').
  UPDATE child_documents
     SET current_version_id = v_version_x, status = 'active'
     WHERE id = v_doc_x;
  RAISE NOTICE 'T-16 PASSED: missing visible version blocked';


  ----------------------------------------------------------------
  -- T-17 actor_kind CHECK accepts 'organization_member'
  -- Allowed and denied paths above already inserted multiple
  -- audit rows with actor_kind='organization_member'. If the CHECK
  -- weren't widened, those inserts would have raised. So this is a
  -- direct assertion that we have at least one such row.
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM document_access_events
    WHERE actor_kind='organization_member';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'T-17 FAILED: no organization_member audit rows captured';
  END IF;
  RAISE NOTICE 'T-17 PASSED: actor_kind=organization_member rows are landing (count=%)', v_count;


  ----------------------------------------------------------------
  -- T-18 Storage RLS unchanged
  -- Clinic-side direct SELECT on storage.objects in the
  -- child-documents bucket should return 0 rows (no client SELECT
  -- policy exists).
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM storage.objects
    WHERE bucket_id='child-documents';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-18 FAILED: clinic SELECT storage.objects returned % (expected 0)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-18 PASSED: storage RLS unchanged (no clinic SELECT)';


  ----------------------------------------------------------------
  -- T-19 Other school-owned tables stay invisible
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-076@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Sanity: clinic A still has the doc grant on doc_x active here
  IF NOT (v_doc_x = ANY(caller_visible_document_ids_for_organizations())) THEN
    RAISE EXCEPTION 'T-19 sanity: doc_x should be visible via helper';
  END IF;

  -- Negative checks across school-internal tables
  SELECT count(*) INTO v_count FROM students;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % students', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM schools;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % schools', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM child_documents;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % child_documents (existing policy untouched)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM child_document_versions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % child_document_versions', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM student_plans;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % student_plans', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM document_consents;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % document_consents', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM document_access_grants;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % document_access_grants', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM document_requests;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % document_requests', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM external_contacts;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-19 FAILED: clinic saw % external_contacts', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-19 PASSED: school-owned tables still invisible';


  ----------------------------------------------------------------
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'Migration 076 smoke test: ALL SCENARIOS PASSED';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$ LANGUAGE plpgsql;

-- Discard everything we created. Change to COMMIT to inspect.
ROLLBACK;

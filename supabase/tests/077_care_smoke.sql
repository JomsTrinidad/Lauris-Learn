-- ============================================================
-- Smoke tests for migration 077 — Phase 6A (Care portal
-- enumeration helper). BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Function present, SECURITY DEFINER, STABLE, EXECUTE granted
--         to authenticated only (REVOKE PUBLIC).
--   T-2   Unauthenticated caller → 0 rows (no exception).
--   T-3   Authenticated caller without an active membership in
--         p_org_id → 0 rows (no exception).
--   T-4   Active member of clinic A: returns ONLY doc_x (the granted
--         doc), with correct title, status, version_number,
--         child_profile_id, permissions JSONB.
--   T-5   doc_y (no Phase 5B grant) is NOT returned.
--   T-6   Cross-clinic isolation — therapist B (clinic B) calling
--         with p_org_id=clinic_a_id → 0 rows (no membership in A).
--   T-7   Doc with status='draft' is filtered out (only active|shared
--         surface).
--   T-9   Expired grant is filtered out (valid_until <= NOW()).
--   T-10  Revoked grant is filtered out (status='revoked').
--
--   (Note: a hypothetical "hidden current version" case would be
--   redundant. Trigger 5.D refuses any UPDATE that points
--   current_version_id at a hidden version, and CHECK
--   child_documents_current_version_required_chk forbids non-draft
--   docs with current_version_id=NULL. Schema invariants make the
--   `cdv.is_hidden IS NOT TRUE` clamp in the RPC body defense-in-
--   depth only, with no reachable fixture.)
--   T-11  ★ Strict isolation regression ★ — accessible_document_ids(),
--         log_document_access, log_document_access_for_organizations,
--         caller_visible_document_ids_for_organizations bodies do not
--         reference list_documents_for_organization.
--   T-12  child_documents direct SELECT still returns 0 (we did not
--         widen any policy).
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id          UUID;
  v_admin_id           UUID;
  v_school_org_id      UUID;

  v_student_id         UUID;
  v_profile_id         UUID;
  v_doc_x              UUID;
  v_doc_y              UUID;
  v_doc_draft          UUID;
  v_doc_expired        UUID;
  v_doc_revoked        UUID;

  v_version_x          UUID;
  v_version_y          UUID;
  v_version_draft      UUID;
  v_version_expired    UUID;
  v_version_revoked    UUID;

  v_clinic_a_id        UUID;
  v_clinic_b_id        UUID;
  v_therapist_a_uid    UUID;
  v_therapist_b_uid    UUID;

  v_grant_x            UUID;
  v_grant_expired      UUID;
  v_grant_revoked      UUID;

  v_count              INT;
  v_row                RECORD;
  v_def                TEXT;
  v_proc_oid           OID;
  v_security_def       BOOLEAN;
  v_volatility         "char";
BEGIN
  ----------------------------------------------------------------
  -- 0. Fixtures
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id INTO v_admin_id
    FROM profiles WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no admin'; END IF;

  SELECT id INTO v_school_org_id
    FROM organizations WHERE kind='school' AND school_id = v_school_id;


  ----------------------------------------------------------------
  -- T-1 Function present, SECURITY DEFINER, STABLE, REVOKE/GRANT
  ----------------------------------------------------------------
  SELECT p.oid, p.prosecdef, p.provolatile
    INTO v_proc_oid, v_security_def, v_volatility
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'list_documents_for_organization' AND n.nspname='public';
  IF v_proc_oid IS NULL THEN
    RAISE EXCEPTION 'T-1 FAILED: function missing';
  END IF;
  IF NOT v_security_def THEN
    RAISE EXCEPTION 'T-1 FAILED: function not SECURITY DEFINER';
  END IF;
  -- 's' = STABLE in pg_proc.provolatile
  IF v_volatility <> 's' THEN
    RAISE EXCEPTION 'T-1 FAILED: function not STABLE (got %)', v_volatility;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='list_documents_for_organization'
       AND grantee='PUBLIC'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: PUBLIC still has EXECUTE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='list_documents_for_organization'
       AND grantee='authenticated'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: authenticated lacks EXECUTE';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize fixtures
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 077 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 077 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-077@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-077@example.com','TEST 077 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tB-077@example.com')
    RETURNING id INTO v_therapist_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_b_uid,'tB-077@example.com','TEST 077 Therapist B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;

  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_therapist_b_uid, 'therapist', 'active');

  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST077','PortalShell')
    RETURNING id INTO v_student_id;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST077 PortalShell','TEST077','PortalShell','lauris_learn')
    RETURNING id INTO v_profile_id;
  UPDATE students SET child_profile_id = v_profile_id WHERE id = v_student_id;

  -- doc_x: granted to clinic A, active.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'parent_provided', 'TEST 077 doc X', 'draft', v_admin_id)
    RETURNING id INTO v_doc_x;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_x, v_school_id, 1,
    v_school_id::text || '/' || v_student_id::text || '/' || v_doc_x::text || '/v1.pdf',
    'docX.pdf', 1234, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_version_x;
  UPDATE child_documents SET current_version_id = v_version_x, status = 'active' WHERE id = v_doc_x;

  -- doc_y: NO grant to clinic A. Used in T-5.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'medical_certificate', 'TEST 077 doc Y', 'draft', v_admin_id)
    RETURNING id INTO v_doc_y;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_y, v_school_id, 1,
    v_school_id::text || '/' || v_student_id::text || '/' || v_doc_y::text || '/v1.pdf',
    'docY.pdf', 1234, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_version_y;
  UPDATE child_documents SET current_version_id = v_version_y, status = 'active' WHERE id = v_doc_y;

  -- doc_draft: granted to clinic A but cd.status='draft' → must be filtered.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'iep', 'TEST 077 doc DRAFT', 'draft', v_admin_id)
    RETURNING id INTO v_doc_draft;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_draft, v_school_id, 1,
    v_school_id::text || '/' || v_student_id::text || '/' || v_doc_draft::text || '/v1.pdf',
    'docDraft.pdf', 1234, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_version_draft;
  UPDATE child_documents SET current_version_id = v_version_draft WHERE id = v_doc_draft;
  -- Status stays 'draft' on purpose.

  -- doc_expired: granted with valid_until in the past.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'medical_certificate', 'TEST 077 doc EXPIRED', 'draft', v_admin_id)
    RETURNING id INTO v_doc_expired;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_expired, v_school_id, 1,
    v_school_id::text || '/' || v_student_id::text || '/' || v_doc_expired::text || '/v1.pdf',
    'docExpired.pdf', 1234, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_version_expired;
  UPDATE child_documents SET current_version_id = v_version_expired, status = 'active' WHERE id = v_doc_expired;

  -- doc_revoked: granted, but grant.status='revoked'.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_id, 'school_accommodation', 'TEST 077 doc REVOKED', 'draft', v_admin_id)
    RETURNING id INTO v_doc_revoked;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_revoked, v_school_id, 1,
    v_school_id::text || '/' || v_student_id::text || '/' || v_doc_revoked::text || '/v1.pdf',
    'docRevoked.pdf', 1234, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_version_revoked;
  UPDATE child_documents SET current_version_id = v_version_revoked, status = 'active' WHERE id = v_doc_revoked;

  -- Phase 5B grants: doc_x (active, future), doc_draft, doc_hidden,
  -- doc_expired (already past), doc_revoked (status revoked).
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_x, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active', NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',true,'comment',false,'upload_new_version',false)
  ) RETURNING id INTO v_grant_x;

  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_draft, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active', NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false)
  );

  -- Past-dated grant. We bypass cpag_valid_window-style guards by
  -- inserting valid_from in the past too. doag has no such CHECK on
  -- valid_until (only valid_until > valid_from), so a past expiry is
  -- allowed at insert time as long as both are in the past and
  -- valid_until > valid_from. The doag column-guard uses is_super_admin()
  -- bypass, so within this DO block (no auth.uid()) the trigger lets
  -- the expired-shape insert through.
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_expired, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active',
    NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false)
  ) RETURNING id INTO v_grant_expired;

  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions, revoked_at, revoke_reason
  ) VALUES (
    v_doc_revoked, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'revoked',
    NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false),
    NOW(), 'test'
  ) RETURNING id INTO v_grant_revoked;


  ----------------------------------------------------------------
  -- T-2 Unauthenticated → 0 rows
  ----------------------------------------------------------------
  -- No SET ROLE, no jwt claims set. auth.uid() will be NULL.
  SELECT count(*) INTO v_count FROM list_documents_for_organization(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-2 FAILED: unauthenticated returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- T-3 Authenticated but not a member of p_org_id → 0 rows
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_b_uid::text, 'email','tB-077@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM list_documents_for_organization(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: non-member returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-3 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-4 Active member returns ONLY doc_x (active grant + active doc)
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-077@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM list_documents_for_organization(v_clinic_a_id);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-4 FAILED: expected 1 row, got %', v_count;
  END IF;

  SELECT * INTO v_row FROM list_documents_for_organization(v_clinic_a_id) LIMIT 1;
  IF v_row.document_id <> v_doc_x THEN
    RAISE EXCEPTION 'T-4 FAILED: wrong document_id';
  END IF;
  IF v_row.title <> 'TEST 077 doc X' THEN
    RAISE EXCEPTION 'T-4 FAILED: wrong title';
  END IF;
  IF v_row.version_number <> 1 THEN
    RAISE EXCEPTION 'T-4 FAILED: wrong version_number';
  END IF;
  IF v_row.child_profile_id <> v_profile_id THEN
    RAISE EXCEPTION 'T-4 FAILED: wrong child_profile_id (expected %, got %)', v_profile_id, v_row.child_profile_id;
  END IF;
  IF (v_row.permissions->>'download')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'T-4 FAILED: permissions.download not preserved';
  END IF;
  RAISE NOTICE 'T-4 PASSED';


  ----------------------------------------------------------------
  -- T-5 doc_y not returned (no grant) — covered implicitly by T-4
  -- count, but assert explicitly for clarity.
  ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM list_documents_for_organization(v_clinic_a_id)
    WHERE document_id = v_doc_y
  ) THEN
    RAISE EXCEPTION 'T-5 FAILED: doc_y leaked through';
  END IF;
  RAISE NOTICE 'T-5 PASSED';


  ----------------------------------------------------------------
  -- T-7 doc_draft filtered out (cd.status='draft')
  ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM list_documents_for_organization(v_clinic_a_id)
    WHERE document_id = v_doc_draft
  ) THEN
    RAISE EXCEPTION 'T-7 FAILED: draft doc surfaced';
  END IF;
  RAISE NOTICE 'T-7 PASSED';


  ----------------------------------------------------------------
  -- T-9 doc_expired filtered out (grant.valid_until in past)
  ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM list_documents_for_organization(v_clinic_a_id)
    WHERE document_id = v_doc_expired
  ) THEN
    RAISE EXCEPTION 'T-9 FAILED: expired-grant doc surfaced';
  END IF;
  RAISE NOTICE 'T-9 PASSED';


  ----------------------------------------------------------------
  -- T-10 doc_revoked filtered out (grant.status='revoked')
  ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM list_documents_for_organization(v_clinic_a_id)
    WHERE document_id = v_doc_revoked
  ) THEN
    RAISE EXCEPTION 'T-10 FAILED: revoked-grant doc surfaced';
  END IF;
  RAISE NOTICE 'T-10 PASSED';


  ----------------------------------------------------------------
  -- T-6 Cross-clinic isolation — therapist B querying clinic A
  ----------------------------------------------------------------
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_b_uid::text, 'email','tB-077@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM list_documents_for_organization(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: cross-clinic returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-6 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-11 ★ Strict isolation regression check ★
  ----------------------------------------------------------------
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'accessible_document_ids',
         'log_document_access',
         'log_document_access_for_organizations',
         'caller_visible_document_ids_for_organizations'
       )
  LOOP
    IF position('list_documents_for_organization' IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-11 FAILED: existing helper/RPC body references new function';
    END IF;
  END LOOP;
  RAISE NOTICE 'T-11 PASSED: existing helpers are byte-clean';


  ----------------------------------------------------------------
  -- T-12 child_documents direct SELECT still returns 0 for clinic
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-077@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM child_documents WHERE id = v_doc_x;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: clinic user sees child_documents directly (count=%)', v_count;
  END IF;
  RAISE NOTICE 'T-12 PASSED: child_documents direct SELECT returns 0 for clinic user';
  RESET ROLE;


  RAISE NOTICE '✓ All 077 smoke tests passed.';
END $$;

ROLLBACK;

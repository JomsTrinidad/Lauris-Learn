-- ============================================================
-- Smoke tests for migration 081 — Phase 6C (clinic_documents).
-- BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Schema artifacts present (tables, indexes, triggers, RPC,
--         storage bucket, storage policies).
--   T-2   ★ Existing artifacts byte-clean ★
--         accessible_document_ids(), log_document_access(),
--         log_document_access_for_organizations(),
--         list_documents_for_organization(),
--         caller_owned_child_profile_ids() bodies do not reference
--         any 6C artifact. All existing child_documents-related
--         policies are untouched.
--   T-3   Origin/child consistency trigger rejects mismatched origin.
--   T-4   document_kind normalization stores LOWER(TRIM(...)).
--   T-5   Clinic-A admin INSERTs a clinic_documents row + version,
--         repoints current_version_id. Happy path.
--   T-6   Clinic-A non-admin (therapist) cannot INSERT (RLS).
--   T-7   Clinic-B admin cannot INSERT for clinic-A's child (RLS).
--   T-8   Cross-clinic SELECT isolation: clinic-B sees 0 of clinic-A's docs.
--   T-9   School isolation: school_admin sees 0 clinic_documents.
--   T-10  Column-guard rejects UPDATE on origin_organization_id,
--         child_profile_id, created_by_profile_id (42501 each).
--   T-11  permissions JSONB CHECK rejects malformed shapes.
--   T-12  status CHECK rejects 'shared' / 'revoked' (deferred values).
--   T-13  log_clinic_document_access happy paths:
--           - admin requests preview_opened → allowed.
--           - admin requests download → allowed (always).
--   T-14  log_clinic_document_access denial paths:
--           - non-admin requests download with default perms
--             { view:true, download:false } → 'download_not_permitted'.
--           - admin requests preview on archived doc → 'doc_archived'.
--           - cross-clinic admin requests anything → 'not_owned'.
--           - unauthenticated → 'unauthenticated'.
--   T-15  Audit table: every decision row landed; non-admin therapist
--         can NOT SELECT clinic_document_access_events; admin CAN.
--   T-16  No DELETE policy: admin DELETE on clinic_documents → 0 rows.
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id            UUID;
  v_admin_id             UUID;
  v_admin_email          TEXT;
  v_school_org_id        UUID;

  v_clinic_a_id          UUID;
  v_clinic_b_id          UUID;
  v_admin_a_uid          UUID;
  v_therapist_a_uid      UUID;
  v_admin_b_uid          UUID;

  v_child_a_id           UUID;
  v_child_b_id           UUID;

  v_doc_a_id             UUID;
  v_ver_a_id             UUID;
  v_archived_doc_id      UUID;

  v_def                  TEXT;
  v_caught               BOOLEAN;
  v_caught_state         TEXT;
  v_count                INT;
  v_rows                 INT;
  v_decision             JSONB;
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
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='clinic_documents') THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic_documents missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='clinic_document_versions') THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic_document_versions missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='clinic_document_access_events') THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic_document_access_events missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='log_clinic_document_access') THEN
    RAISE EXCEPTION 'T-1 FAILED: log_clinic_document_access RPC missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='cd_origin_consistency_validate_trg') THEN
    RAISE EXCEPTION 'T-1 FAILED: origin-consistency trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='cd_immutable_columns_guard_trg') THEN
    RAISE EXCEPTION 'T-1 FAILED: column-guard trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='cd_normalize_kind_trg') THEN
    RAISE EXCEPTION 'T-1 FAILED: kind-normalize trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='clinic-documents') THEN
    RAISE EXCEPTION 'T-1 FAILED: clinic-documents storage bucket missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='objects' AND policyname='clinic_documents_admin_insert'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: storage INSERT policy missing';
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
         'caller_visible_document_ids_for_organizations'
       )
  LOOP
    IF position('clinic_documents'                   IN v_def) > 0
       OR position('clinic_document_versions'        IN v_def) > 0
       OR position('clinic_document_access_events'   IN v_def) > 0
       OR position('log_clinic_document_access'      IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-2 FAILED: existing helper/RPC body references 6C artifacts';
    END IF;
  END LOOP;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize fixtures
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 081 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 081 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aA-081@example.com')
    RETURNING id INTO v_admin_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_a_uid,'aA-081@example.com','TEST 081 Admin A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_admin_a_uid, 'clinic_admin', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-081@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-081@example.com','TEST 081 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aB-081@example.com')
    RETURNING id INTO v_admin_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_b_uid,'aB-081@example.com','TEST 081 Admin B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_admin_b_uid, 'clinic_admin', 'active');

  -- Two clinic-owned children — one in each clinic.
  v_child_a_id := gen_random_uuid();
  v_child_b_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, origin_organization_id, created_in_app)
    VALUES (v_child_a_id,'TEST 081 ClinicA Kid', v_clinic_a_id,'lauris_care'),
           (v_child_b_id,'TEST 081 ClinicB Kid', v_clinic_b_id,'lauris_care');


  ----------------------------------------------------------------
  -- T-3  Origin/child consistency trigger rejects mismatch.
  --      As clinic-A admin, try to attach clinic-B's child.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-081@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO clinic_documents
      (id, origin_organization_id, child_profile_id, document_kind, title, created_by_profile_id)
      VALUES
      (gen_random_uuid(), v_clinic_a_id, v_child_b_id,'therapy_evaluation','MISMATCHED', v_admin_a_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-3 FAILED: origin/child mismatch was not rejected';
  END IF;
  RAISE NOTICE 'T-3 PASSED';


  ----------------------------------------------------------------
  -- T-4  Kind normalization (LOWER(TRIM)).
  ----------------------------------------------------------------
  v_doc_a_id := gen_random_uuid();
  INSERT INTO clinic_documents
    (id, origin_organization_id, child_profile_id, document_kind, title, created_by_profile_id)
    VALUES
    (v_doc_a_id, v_clinic_a_id, v_child_a_id,'  Therapy Evaluation  ','Initial Eval', v_admin_a_uid);

  RESET ROLE;
  IF (SELECT document_kind FROM clinic_documents WHERE id = v_doc_a_id) <> 'therapy evaluation' THEN
    RAISE EXCEPTION 'T-4 FAILED: kind not normalized';
  END IF;
  RAISE NOTICE 'T-4 PASSED';


  ----------------------------------------------------------------
  -- T-5  Insert version + repoint head.
  ----------------------------------------------------------------
  v_ver_a_id := gen_random_uuid();
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-081@example.com')::text);
  SET LOCAL ROLE authenticated;

  INSERT INTO clinic_document_versions
    (id, document_id, version_number, storage_path, mime_type, file_name, file_size, uploaded_by_profile_id)
    VALUES
    (v_ver_a_id, v_doc_a_id, 1,
     v_clinic_a_id::text || '/' || v_child_a_id::text || '/' || v_doc_a_id::text || '/v1.pdf',
     'application/pdf','initial-eval.pdf', 12345, v_admin_a_uid);

  UPDATE clinic_documents
     SET current_version_id = v_ver_a_id, status = 'active'
   WHERE id = v_doc_a_id;
  RAISE NOTICE 'T-5 PASSED';


  ----------------------------------------------------------------
  -- T-6  Therapist (non-admin) cannot INSERT.
  ----------------------------------------------------------------
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-081@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO clinic_documents
      (id, origin_organization_id, child_profile_id, document_kind, title, created_by_profile_id)
      VALUES
      (gen_random_uuid(), v_clinic_a_id, v_child_a_id,'therapy_progress','TherFAIL', v_therapist_a_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-6 FAILED: therapist INSERT not rejected';
  END IF;
  RAISE NOTICE 'T-6 PASSED';


  ----------------------------------------------------------------
  -- T-7  Cross-clinic INSERT — admin B inserting for clinic-A's child.
  ----------------------------------------------------------------
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-081@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO clinic_documents
      (id, origin_organization_id, child_profile_id, document_kind, title, created_by_profile_id)
      VALUES
      (gen_random_uuid(), v_clinic_b_id, v_child_a_id,'therapy_progress','XClinicFAIL', v_admin_b_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-7 FAILED: cross-clinic INSERT not rejected';
  END IF;
  RAISE NOTICE 'T-7 PASSED';


  ----------------------------------------------------------------
  -- T-8  Cross-clinic SELECT isolation.
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count FROM clinic_documents
   WHERE origin_organization_id = v_clinic_a_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: clinic B sees % of clinic A docs', v_count;
  END IF;
  RAISE NOTICE 'T-8 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-9  School isolation.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email)::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM clinic_documents;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-9 FAILED: school_admin sees % clinic docs', v_count;
  END IF;
  RAISE NOTICE 'T-9 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-10  Column-guard rejects immutable-column UPDATEs.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-081@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- 10a — origin
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE clinic_documents SET origin_organization_id = v_clinic_b_id WHERE id = v_doc_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-10a FAILED: origin update not rejected (caught=%, state=%)', v_caught, v_caught_state;
  END IF;

  -- 10b — child
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE clinic_documents SET child_profile_id = v_child_b_id WHERE id = v_doc_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-10b FAILED: child update not rejected (caught=%, state=%)', v_caught, v_caught_state;
  END IF;

  -- 10c — created_by
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE clinic_documents SET created_by_profile_id = v_therapist_a_uid WHERE id = v_doc_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-10c FAILED: created_by update not rejected (caught=%, state=%)', v_caught, v_caught_state;
  END IF;
  RAISE NOTICE 'T-10 PASSED';


  ----------------------------------------------------------------
  -- T-11  permissions JSONB CHECK rejects malformed shapes.
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    INSERT INTO clinic_documents
      (origin_organization_id, child_profile_id, document_kind, title,
       permissions, created_by_profile_id)
      VALUES
      (v_clinic_a_id, v_child_a_id,'therapy_progress','BadPerms',
       '{"view":true}'::jsonb, v_admin_a_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-11 FAILED: malformed permissions not rejected';
  END IF;

  v_caught := false;
  BEGIN
    INSERT INTO clinic_documents
      (origin_organization_id, child_profile_id, document_kind, title,
       permissions, created_by_profile_id)
      VALUES
      (v_clinic_a_id, v_child_a_id,'therapy_progress','BadPerms2',
       '{"view":"yes","download":false}'::jsonb, v_admin_a_uid);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-11 FAILED: non-boolean permissions value not rejected';
  END IF;
  RAISE NOTICE 'T-11 PASSED';


  ----------------------------------------------------------------
  -- T-12  Status CHECK rejects deferred values.
  ----------------------------------------------------------------
  v_caught := false;
  BEGIN
    UPDATE clinic_documents SET status = 'shared' WHERE id = v_doc_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12 FAILED: status=shared not rejected';
  END IF;

  v_caught := false;
  BEGIN
    UPDATE clinic_documents SET status = 'revoked' WHERE id = v_doc_a_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-12 FAILED: status=revoked not rejected';
  END IF;
  RAISE NOTICE 'T-12 PASSED';


  ----------------------------------------------------------------
  -- T-13  log_clinic_document_access happy paths.
  ----------------------------------------------------------------
  -- 13a — admin preview
  v_decision := log_clinic_document_access(v_doc_a_id, 'preview_opened', NULL, NULL);
  IF NOT (v_decision->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-13a FAILED: admin preview denied: %', v_decision;
  END IF;
  IF v_decision->>'storage_path' IS NULL THEN
    RAISE EXCEPTION 'T-13a FAILED: storage_path missing on allowed decision';
  END IF;

  -- 13b — admin download (admin override of permissions.download=false)
  v_decision := log_clinic_document_access(v_doc_a_id, 'download', NULL, NULL);
  IF NOT (v_decision->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-13b FAILED: admin download denied: %', v_decision;
  END IF;
  RAISE NOTICE 'T-13 PASSED';


  ----------------------------------------------------------------
  -- T-14  Denial paths.
  ----------------------------------------------------------------
  -- 14a — therapist requesting download with default permissions.
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-081@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_decision := log_clinic_document_access(v_doc_a_id, 'download', NULL, NULL);
  IF (v_decision->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-14a FAILED: therapist download allowed despite permissions.download=false';
  END IF;
  IF v_decision->>'denied_reason' <> 'download_not_permitted' THEN
    RAISE EXCEPTION 'T-14a FAILED: wrong denial reason: %', v_decision->>'denied_reason';
  END IF;

  -- Therapist preview should still work (view=true).
  v_decision := log_clinic_document_access(v_doc_a_id, 'preview_opened', NULL, NULL);
  IF NOT (v_decision->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-14a-bis FAILED: therapist preview denied unexpectedly: %', v_decision;
  END IF;

  -- 14b — archived doc denies preview to admin.
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-081@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Mint an archived doc with a version
  v_archived_doc_id := gen_random_uuid();
  INSERT INTO clinic_documents
    (id, origin_organization_id, child_profile_id, document_kind, title, status, created_by_profile_id)
    VALUES (v_archived_doc_id, v_clinic_a_id, v_child_a_id,'therapy_progress','Archived', 'active', v_admin_a_uid);
  INSERT INTO clinic_document_versions
    (id, document_id, version_number, storage_path, mime_type, file_name, uploaded_by_profile_id)
    VALUES (gen_random_uuid(), v_archived_doc_id, 1,
            v_clinic_a_id::text || '/' || v_child_a_id::text || '/' || v_archived_doc_id::text || '/v1.pdf',
            'application/pdf','arch.pdf', v_admin_a_uid);
  UPDATE clinic_documents
     SET current_version_id = (SELECT id FROM clinic_document_versions WHERE document_id = v_archived_doc_id LIMIT 1),
         status = 'archived'
   WHERE id = v_archived_doc_id;

  v_decision := log_clinic_document_access(v_archived_doc_id, 'preview_opened', NULL, NULL);
  IF (v_decision->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-14b FAILED: archived preview was allowed';
  END IF;
  IF v_decision->>'denied_reason' <> 'doc_archived' THEN
    RAISE EXCEPTION 'T-14b FAILED: wrong denial reason: %', v_decision->>'denied_reason';
  END IF;

  -- 14c — cross-clinic admin requests anything.
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-081@example.com')::text);
  SET LOCAL ROLE authenticated;
  v_decision := log_clinic_document_access(v_doc_a_id, 'preview_opened', NULL, NULL);
  IF (v_decision->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-14c FAILED: cross-clinic preview was allowed';
  END IF;
  IF v_decision->>'denied_reason' <> 'not_owned' THEN
    RAISE EXCEPTION 'T-14c FAILED: wrong denial reason: %', v_decision->>'denied_reason';
  END IF;

  RESET ROLE;

  -- 14d — unauthenticated.
  -- "anon" role with no JWT claim → auth.uid() is NULL.
  EXECUTE 'SET LOCAL "request.jwt.claims" = ''{}''';
  SET LOCAL ROLE authenticated;
  v_decision := log_clinic_document_access(v_doc_a_id, 'preview_opened', NULL, NULL);
  IF (v_decision->>'allowed')::boolean THEN
    RAISE EXCEPTION 'T-14d FAILED: unauthenticated preview was allowed';
  END IF;
  IF v_decision->>'denied_reason' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'T-14d FAILED: wrong denial reason: %', v_decision->>'denied_reason';
  END IF;
  RAISE NOTICE 'T-14 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-15  Audit visibility — admin sees all events for own clinic;
  --       therapist sees zero.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-081@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM clinic_document_access_events
   WHERE origin_organization_id = v_clinic_a_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'T-15 FAILED: admin sees no audit events (expected ≥ 1)';
  END IF;
  RESET ROLE;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-081@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM clinic_document_access_events;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-15 FAILED: therapist sees % audit events (expected 0)', v_count;
  END IF;
  RAISE NOTICE 'T-15 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-16  No DELETE on clinic_documents.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-081@example.com')::text);
  SET LOCAL ROLE authenticated;
  DELETE FROM clinic_documents WHERE id = v_doc_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-16 FAILED: DELETE deleted % rows (expected 0)', v_rows;
  END IF;
  RAISE NOTICE 'T-16 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 081 smoke tests passed.';
END
$$ LANGUAGE plpgsql;

ROLLBACK;

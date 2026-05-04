-- ============================================================
-- Smoke tests for migration 071 — Shared Child Identity Layer
--
-- Scope (deliberately narrow):
--   T-1  Backfill ran: every student has child_profile_id; every
--        backfilled child_profile has a non-blank display_name.
--   T-2  school_admin can SELECT/INSERT/UPDATE child_profiles linked
--        to their school's students; INSERT a child_identifier (LRN).
--   T-3  school_admin of school A cannot SELECT a child_profile that
--        is only linked to school B's students.
--   T-4  teacher (bridged via teacher_profiles.auth_user_id, mig 066)
--        sees only profiles linked to students in classes they teach.
--   T-5  parent has no read or write access (skipped if no parent
--        profile exists in the database).
--   T-6  Unique-index NULL safety: inserting two child_identifiers
--        with the same (type, value) and NULL country_code raises
--        unique_violation; same with both country_code='PH'.
--   T-7  Documents (child_documents) and Plans (student_plans) are
--        unaffected by migration 071.
--   T-8  Backfill is idempotent — re-running it inserts 0 rows.
--
-- Run ONLY in a non-production project (Supabase SQL Editor with the
-- service role, or psql as a Postgres superuser). The whole script
-- runs inside BEGIN/ROLLBACK so all fixtures and test data are
-- discarded — change the trailing ROLLBACK to COMMIT to keep them
-- for inspection.
--
-- Impersonation pattern matches supabase/tests/070_student_plans_smoke.sql:
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","email":"<email>"}';
-- These reset on the surrounding transaction's end.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- Existing fixtures
  v_school_id          UUID;
  v_other_school_id    UUID;        -- a second school (synthesized if needed)
  v_admin_id           UUID;        -- profiles.id of a school_admin
  v_teacher_uid        UUID;        -- profiles.id (== auth.uid()) for a teacher
  v_teacher_prof_id    UUID;        -- teacher_profiles.id (separate from auth.uid)
  v_school_year_id     UUID;
  v_parent_uid         UUID;        -- profiles.id of a parent (skipped if NULL)
  v_parent_email       TEXT;

  -- Fixtures we synthesize for isolation
  v_class_in_id        UUID;
  v_class_out_id       UUID;
  v_student_visible    UUID;        -- enrolled in class_in (teacher CAN see)
  v_student_hidden     UUID;        -- enrolled in class_out (teacher CANNOT see)
  v_student_other_sch  UUID;        -- belongs to a DIFFERENT school (T-3)
  v_doc_id             UUID;        -- child_documents row for T-7

  -- Profile + identifier ids
  v_profile_visible    UUID;
  v_profile_hidden     UUID;
  v_profile_other_sch  UUID;
  v_identifier_id      UUID;

  -- Result holders
  v_caught             BOOLEAN;
  v_count              INT;
  v_total_students     INT;
  v_unlinked           INT;
  v_blank_names        INT;
  v_idemp_inserted     INT;
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

  SELECT id INTO v_teacher_uid
    FROM profiles
    WHERE school_id = v_school_id AND role = 'teacher'
    ORDER BY created_at
    LIMIT 1;
  IF v_teacher_uid IS NULL THEN
    RAISE EXCEPTION 'need at least one teacher profile in school for tests';
  END IF;

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

  -- A second school for cross-tenant tests. If only one school exists,
  -- synthesize a throwaway one (rolled back at end).
  SELECT id INTO v_other_school_id
    FROM schools
    WHERE id <> v_school_id
    ORDER BY created_at
    LIMIT 1;
  IF v_other_school_id IS NULL THEN
    INSERT INTO schools (name) VALUES ('TEST 071 — other school')
      RETURNING id INTO v_other_school_id;
  END IF;

  -- Optional parent profile
  SELECT id, email INTO v_parent_uid, v_parent_email
    FROM profiles
    WHERE role = 'parent'
    LIMIT 1;


  ----------------------------------------------------------------
  -- T-1  Backfill ran cleanly
  --
  --   - Every existing student should have child_profile_id set
  --     (the migration's §6 backfill links them 1:1).
  --   - Every backfilled child_profile must have a non-blank
  --     display_name (the COALESCE+NULLIF safety net + CHECK).
  ----------------------------------------------------------------
  SELECT count(*) INTO v_total_students FROM students;
  SELECT count(*) INTO v_unlinked FROM students WHERE child_profile_id IS NULL;
  IF v_unlinked <> 0 THEN
    RAISE EXCEPTION 'T-1 FAILED: % students still have NULL child_profile_id (expected 0)',
      v_unlinked;
  END IF;

  SELECT count(*) INTO v_blank_names
    FROM child_profiles
    WHERE length(trim(display_name)) = 0;
  IF v_blank_names <> 0 THEN
    RAISE EXCEPTION 'T-1 FAILED: % child_profiles have blank display_name', v_blank_names;
  END IF;

  RAISE NOTICE 'T-1 PASSED: % students linked, all child_profiles have a display_name',
    v_total_students;


  ----------------------------------------------------------------
  -- 1. Synthesize isolated test fixtures
  ----------------------------------------------------------------

  -- Two classes in the active SY.
  -- NOTE: `classes.level` was dropped in migration 061; the replacement
  -- `classes.level_id` (FK → class_levels) is nullable, so we omit it.
  INSERT INTO classes (school_id, school_year_id, name, start_time, end_time)
    VALUES (v_school_id, v_school_year_id, 'TEST 071 — class IN', '08:00', '11:00')
    RETURNING id INTO v_class_in_id;

  INSERT INTO classes (school_id, school_year_id, name, start_time, end_time)
    VALUES (v_school_id, v_school_year_id, 'TEST 071 — class OUT', '13:00', '15:00')
    RETURNING id INTO v_class_out_id;

  -- Three students. Two in our school, one in the other school.
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id, 'TEST071', 'Visible')
    RETURNING id INTO v_student_visible;

  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id, 'TEST071', 'Hidden')
    RETURNING id INTO v_student_hidden;

  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_other_school_id, 'TEST071', 'Other')
    RETURNING id INTO v_student_other_sch;

  -- Migration's backfill only triggers at migration time. For our
  -- fresh test rows we need to create+link child_profiles manually.
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST071 Visible', 'TEST071', 'Visible', 'lauris_learn')
    RETURNING id INTO v_profile_visible;
  UPDATE students SET child_profile_id = v_profile_visible WHERE id = v_student_visible;

  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST071 Hidden', 'TEST071', 'Hidden', 'lauris_learn')
    RETURNING id INTO v_profile_hidden;
  UPDATE students SET child_profile_id = v_profile_hidden WHERE id = v_student_hidden;

  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST071 Other', 'TEST071', 'Other', 'lauris_learn')
    RETURNING id INTO v_profile_other_sch;
  UPDATE students SET child_profile_id = v_profile_other_sch WHERE id = v_student_other_sch;

  INSERT INTO enrollments (student_id, class_id, school_year_id, status, enrolled_at)
    VALUES (v_student_visible, v_class_in_id, v_school_year_id, 'enrolled', NOW());
  INSERT INTO enrollments (student_id, class_id, school_year_id, status, enrolled_at)
    VALUES (v_student_hidden, v_class_out_id, v_school_year_id, 'enrolled', NOW());

  -- Bridge teacher auth.uid() → teacher_profiles.id (migration 066 contract)
  SELECT id INTO v_teacher_prof_id
    FROM teacher_profiles
    WHERE school_id = v_school_id AND auth_user_id = v_teacher_uid;
  IF v_teacher_prof_id IS NULL THEN
    INSERT INTO teacher_profiles (school_id, full_name, email, auth_user_id)
      SELECT v_school_id, p.full_name, p.email, v_teacher_uid
        FROM profiles p
        WHERE p.id = v_teacher_uid
      RETURNING id INTO v_teacher_prof_id;
  END IF;

  INSERT INTO class_teachers (class_id, teacher_id)
    VALUES (v_class_in_id, v_teacher_prof_id)
    ON CONFLICT (class_id, teacher_id) DO NOTHING;
  DELETE FROM class_teachers
    WHERE class_id = v_class_out_id AND teacher_id = v_teacher_prof_id;

  -- A child_documents row for T-7
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_visible, 'parent_provided',
            'TEST 071 attachable doc', 'draft', v_admin_id)
    RETURNING id INTO v_doc_id;

  RAISE NOTICE 'Fixtures: school=% other_school=% admin=% teacher_uid=% teacher_prof=% class_in=% class_out=% s_visible=% s_hidden=% s_other=%',
    v_school_id, v_other_school_id, v_admin_id, v_teacher_uid, v_teacher_prof_id,
    v_class_in_id, v_class_out_id, v_student_visible, v_student_hidden, v_student_other_sch;


  ----------------------------------------------------------------
  -- T-2  school_admin can read/write linked child_profiles +
  --      insert a new child_identifier.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin071@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- SELECT: should see v_profile_visible + v_profile_hidden, not v_profile_other_sch
  SELECT count(*) INTO v_count
    FROM child_profiles
    WHERE id IN (v_profile_visible, v_profile_hidden, v_profile_other_sch);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'T-2 FAILED: admin SELECT returned % rows (expected 2)', v_count;
  END IF;

  -- UPDATE: rename a profile linked to own school
  UPDATE child_profiles
     SET preferred_name = 'TEST071 nickname'
     WHERE id = v_profile_visible;
  IF NOT EXISTS (
    SELECT 1 FROM child_profiles
    WHERE id = v_profile_visible AND preferred_name = 'TEST071 nickname'
  ) THEN
    RAISE EXCEPTION 'T-2 FAILED: admin UPDATE on linked profile did not persist';
  END IF;

  -- INSERT a new child_profile (linking happens in a separate UPDATE on students)
  INSERT INTO child_profiles (display_name, created_in_app)
    VALUES ('TEST071 admin-created', 'lauris_learn');

  -- INSERT a child_identifier (LRN) on the visible profile
  INSERT INTO child_identifiers (
    child_profile_id, identifier_type, identifier_value, country_code
  ) VALUES (
    v_profile_visible, 'lrn', '123456789012', 'PH'
  ) RETURNING id INTO v_identifier_id;

  IF NOT EXISTS (SELECT 1 FROM child_identifiers WHERE id = v_identifier_id) THEN
    RAISE EXCEPTION 'T-2 FAILED: identifier INSERT did not persist';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-2 PASSED: school_admin can SELECT/UPDATE/INSERT child_profiles and child_identifiers';


  ----------------------------------------------------------------
  -- T-3  Cross-tenant isolation — admin of school A cannot SELECT
  --      a profile that is only linked to school B's students.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin071@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM child_profiles
    WHERE id = v_profile_other_sch;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: admin saw % cross-tenant child_profile rows (expected 0)', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-3 PASSED: cross-tenant child_profile is invisible';


  ----------------------------------------------------------------
  -- T-4  Teacher visibility — only profiles linked to teacher-visible
  --      students are returned (class_in only).
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_teacher_uid::text, 'email', 't071@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Should see v_profile_visible (class_in), but not v_profile_hidden (class_out).
  SELECT count(*) INTO v_count
    FROM child_profiles
    WHERE id = v_profile_visible;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-4 FAILED: teacher could not SELECT visible-class profile (count=%)', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM child_profiles
    WHERE id = v_profile_hidden;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-4 FAILED: teacher saw hidden-class profile (count=%)', v_count;
  END IF;

  -- Teacher should NOT be able to INSERT a child_profile (no policy matches).
  v_caught := FALSE;
  BEGIN
    INSERT INTO child_profiles (display_name, created_in_app)
      VALUES ('TEST071 teacher rejection', 'lauris_learn');
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    DELETE FROM child_profiles WHERE display_name = 'TEST071 teacher rejection';
    RAISE EXCEPTION 'T-4 FAILED: teacher INSERT into child_profiles should have raised 42501';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-4 PASSED: teacher sees only their class profiles and cannot INSERT';


  ----------------------------------------------------------------
  -- T-5  Parent access (skipped if no parent profile exists)
  --
  --   - SELECT child_profiles → may return rows but only those linked
  --     to a student where the parent is a guardian. We can't easily
  --     synthesize a guardian link in this short script, so we just
  --     verify INSERT is rejected.
  ----------------------------------------------------------------
  IF v_parent_uid IS NULL THEN
    RAISE NOTICE 'T-5 SKIPPED: no parent profile in this database';
  ELSE
    EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
      jsonb_build_object('sub', v_parent_uid::text, 'email', v_parent_email)::text);
    SET LOCAL ROLE authenticated;

    v_caught := FALSE;
    BEGIN
      INSERT INTO child_profiles (display_name, created_in_app)
        VALUES ('TEST071 parent rejection', 'lauris_learn');
    EXCEPTION WHEN insufficient_privilege THEN
      v_caught := TRUE;
    END;
    IF NOT v_caught THEN
      DELETE FROM child_profiles WHERE display_name = 'TEST071 parent rejection';
      RAISE EXCEPTION 'T-5 FAILED: parent INSERT should have raised 42501';
    END IF;

    RESET ROLE;
    RAISE NOTICE 'T-5 PASSED: parent has no INSERT access';
  END IF;


  ----------------------------------------------------------------
  -- T-6  Unique-index NULL safety on child_identifiers
  --
  --   - Same (type, value) with NULL country_code on both → must collide.
  --   - Same (type, value) with country_code='PH' on both → must collide.
  -- Run as super-admin path (RESET ROLE so we hit base table without RLS).
  ----------------------------------------------------------------

  -- Set up a clean owner profile for these inserts
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin071@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Two NULL-country inserts of same (type, value) → second must fail
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value)
    VALUES (v_profile_visible, 'passport', 'P-NULLTEST-001');

  v_caught := FALSE;
  BEGIN
    INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value)
      VALUES (v_profile_visible, 'passport', 'P-NULLTEST-001');
  EXCEPTION WHEN unique_violation THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-6 FAILED: duplicate (type,value) with NULL country_code did not collide';
  END IF;

  -- Two PH-country inserts of same (type, value) → second must fail
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_profile_visible, 'lrn', 'LRN-DUP-TEST-99', 'PH');

  v_caught := FALSE;
  BEGIN
    INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
      VALUES (v_profile_hidden, 'lrn', 'LRN-DUP-TEST-99', 'PH');
  EXCEPTION WHEN unique_violation THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-6 FAILED: duplicate (type,value) with country_code=PH did not collide';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T-6 PASSED: NULL-safe uniqueness on (type,value,country_code)';


  ----------------------------------------------------------------
  -- T-7  Documents (child_documents) and Plans (student_plans) are
  --      not impacted by migration 071.
  --
  --   - school_admin can still SELECT and INSERT child_documents.
  --   - school_admin can still INSERT a student_plans row.
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin071@example.com')::text);
  SET LOCAL ROLE authenticated;

  IF NOT EXISTS (SELECT 1 FROM child_documents WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'T-7 FAILED: school_admin lost SELECT access to child_documents';
  END IF;

  -- New document insert should still work.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_visible, 'medical_certificate',
            'TEST 071 — post-migration doc', 'draft', v_admin_id);

  -- New plan insert should still work.
  INSERT INTO student_plans (school_id, student_id, school_year_id, plan_type, title, status, created_by)
    VALUES (v_school_id, v_student_visible, v_school_year_id, 'iep',
            'TEST 071 — post-migration plan', 'draft', v_admin_id);

  RESET ROLE;
  RAISE NOTICE 'T-7 PASSED: child_documents + student_plans inserts still work';


  ----------------------------------------------------------------
  -- T-8  Backfill idempotency
  --
  --      Re-running the §6 backfill INSERT…SELECT for child_profiles
  --      filters on `WHERE s.child_profile_id IS NULL`. After the
  --      migration's first pass nothing should match, so 0 rows
  --      should be inserted.
  ----------------------------------------------------------------
  WITH minted AS MATERIALIZED (
    SELECT
      s.id                  AS student_id,
      gen_random_uuid()     AS profile_id,
      s.first_name,
      s.last_name,
      s.preferred_name,
      s.date_of_birth
    FROM students s
    WHERE s.child_profile_id IS NULL
  ),
  inserted AS (
    INSERT INTO child_profiles (
      id, display_name, first_name, last_name, preferred_name,
      date_of_birth, created_in_app
    )
    SELECT
      m.profile_id,
      COALESCE(
        NULLIF(
          btrim(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')),
          ''
        ),
        'Unknown'
      ),
      m.first_name, m.last_name, m.preferred_name,
      m.date_of_birth, 'lauris_learn'
    FROM minted m
    RETURNING id
  )
  SELECT count(*) INTO v_idemp_inserted FROM inserted;

  IF v_idemp_inserted <> 0 THEN
    RAISE EXCEPTION 'T-8 FAILED: re-running backfill inserted % rows (expected 0)', v_idemp_inserted;
  END IF;
  RAISE NOTICE 'T-8 PASSED: backfill is idempotent';


  ----------------------------------------------------------------
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'Migration 071 smoke test: ALL SCENARIOS PASSED';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$ LANGUAGE plpgsql;

-- Discard everything we created. Change to COMMIT to inspect the rows.
ROLLBACK;

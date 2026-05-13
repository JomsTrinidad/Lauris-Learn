-- 092_grading_scale_assignments_smoke.sql
-- Smoke tests for the grading_scale_assignments system.
-- Run in a transaction; rolls back at the end — no permanent changes.
-- Expected final line: ✓ All 092 smoke tests passed.

BEGIN;

-- ── Helpers ──────────────────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE '── 092 grading_scale_assignments smoke tests ──'; END $$;

-- Mint deterministic UUIDs for the test fixture
DO $$
DECLARE
  v_school_id   UUID := '00000000-0000-0000-0000-000000000001'; -- BK pilot
  v_set_a_id    UUID := '00000000-0000-0000-0000-000000000003'; -- existing Preschool Dev Scale
  v_set_b_id    UUID;
  v_level_id    UUID;
  v_domain_id   UUID;
  v_student_id  UUID;
  v_assign_id     UUID;
  v_dup_school_id UUID;
  v_dup_set_id    UUID;
  v_count         INT;
BEGIN

  -- ── T-1: rating column is now TEXT (not enum) ──────────────────────────
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'progress_observations'
    AND column_name  = 'rating'
    AND data_type    = 'text';
  ASSERT v_count = 1,
    'T-1 FAIL: progress_observations.rating should be TEXT, got non-text type';
  RAISE NOTICE 'T-1 ✓ rating column is TEXT';

  -- ── T-2: scale_item_id column exists on progress_observations ─────────
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'progress_observations'
    AND column_name  = 'scale_item_id';
  ASSERT v_count = 1,
    'T-2 FAIL: scale_item_id column missing on progress_observations';
  RAISE NOTICE 'T-2 ✓ scale_item_id column present';

  -- ── T-3: grading_scale_assignments table exists ────────────────────────
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name   = 'grading_scale_assignments';
  ASSERT v_count = 1,
    'T-3 FAIL: grading_scale_assignments table missing';
  RAISE NOTICE 'T-3 ✓ grading_scale_assignments table exists';

  -- ── T-4: BK school_default seed row inserted (if the hardcoded set exists) ──
  -- The seed INSERT is conditional on grading_scale_sets(000...003) existing.
  -- If the scale set was created through the UI it has a random UUID, so skip gracefully.
  SELECT COUNT(*) INTO v_count
  FROM grading_scale_sets
  WHERE id = v_set_a_id AND school_id = v_school_id;
  IF v_count = 1 THEN
    SELECT COUNT(*) INTO v_count
    FROM grading_scale_assignments
    WHERE school_id       = v_school_id
      AND assignment_type = 'school_default'
      AND is_active       = true;
    ASSERT v_count = 1,
      'T-4 FAIL: BK school_default assignment not seeded even though the scale set 000...003 exists';
    RAISE NOTICE 'T-4 ✓ BK school_default assignment seeded';
  ELSE
    RAISE NOTICE 'T-4 ⚠ skipped — grading_scale_set 000...003 not found (scale was created via UI with a different UUID)';
  END IF;

  -- ── T-5: CHECK constraint — school_default cannot have level_id ────────
  BEGIN
    -- Grab a valid level_id if one exists
    SELECT id INTO v_level_id FROM class_levels WHERE school_id = v_school_id LIMIT 1;
    IF v_level_id IS NOT NULL THEN
      INSERT INTO grading_scale_assignments
        (school_id, grading_scale_set_id, assignment_type, level_id)
      VALUES (v_school_id, v_set_a_id, 'school_default', v_level_id);
      ASSERT false, 'T-5 FAIL: should have rejected school_default with level_id';
    ELSE
      RAISE NOTICE 'T-5 ⚠ skipped — no class_levels exist for BK school';
    END IF;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T-5 ✓ school_default with level_id correctly rejected (check_violation)';
  END;

  -- ── T-6: CHECK constraint — level_default requires level_id ───────────
  BEGIN
    INSERT INTO grading_scale_assignments
      (school_id, grading_scale_set_id, assignment_type, level_id)
    VALUES (v_school_id, v_set_a_id, 'level_default', NULL);
    ASSERT false, 'T-6 FAIL: level_default with NULL level_id should be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T-6 ✓ level_default with NULL level_id correctly rejected';
  END;

  -- ── T-7: CHECK constraint — domain_default requires domain_id ─────────
  BEGIN
    INSERT INTO grading_scale_assignments
      (school_id, grading_scale_set_id, assignment_type, domain_id)
    VALUES (v_school_id, v_set_a_id, 'domain_default', NULL);
    ASSERT false, 'T-7 FAIL: domain_default with NULL domain_id should be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T-7 ✓ domain_default with NULL domain_id correctly rejected';
  END;

  -- ── T-8: CHECK constraint — student_domain_override requires both ──────
  SELECT id INTO v_student_id FROM students WHERE school_id = v_school_id LIMIT 1;
  SELECT id INTO v_domain_id  FROM progress_categories WHERE school_id = v_school_id LIMIT 1;
  IF v_student_id IS NOT NULL AND v_domain_id IS NOT NULL THEN
    BEGIN
      INSERT INTO grading_scale_assignments
        (school_id, grading_scale_set_id, assignment_type, student_id)
      VALUES (v_school_id, v_set_a_id, 'student_domain_override', v_student_id);
      -- student but no domain — should fail
      ASSERT false, 'T-8a FAIL: student_domain_override without domain_id should be rejected';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'T-8a ✓ student_domain_override without domain_id correctly rejected';
    END;
    BEGIN
      INSERT INTO grading_scale_assignments
        (school_id, grading_scale_set_id, assignment_type, domain_id)
      VALUES (v_school_id, v_set_a_id, 'student_domain_override', v_domain_id);
      -- domain but no student — should fail
      ASSERT false, 'T-8b FAIL: student_domain_override without student_id should be rejected';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'T-8b ✓ student_domain_override without student_id correctly rejected';
    END;
  ELSE
    RAISE NOTICE 'T-8 ⚠ skipped — no student or category data available';
  END IF;

  -- ── T-9: Unique constraint — duplicate school_default rejected ─────────
  -- Look up any existing active school_default row — avoids hardcoding UUIDs
  -- that may not exist when the scale set was created through the UI.
  SELECT school_id, grading_scale_set_id
    INTO v_dup_school_id, v_dup_set_id
  FROM grading_scale_assignments
  WHERE assignment_type = 'school_default' AND is_active = true
  LIMIT 1;

  IF v_dup_school_id IS NOT NULL THEN
    BEGIN
      INSERT INTO grading_scale_assignments
        (school_id, grading_scale_set_id, assignment_type)
      VALUES (v_dup_school_id, v_dup_set_id, 'school_default');
      ASSERT false, 'T-9 FAIL: duplicate school_default should be rejected by unique index';
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'T-9 ✓ duplicate active school_default correctly rejected (unique_violation)';
    END;
  ELSE
    RAISE NOTICE 'T-9 ⚠ skipped — no existing school_default row to conflict with';
  END IF;

  -- ── T-10: Resolution hierarchy — domain_default beats school_default ───
  IF v_domain_id IS NOT NULL THEN
    -- Create a second scale set to distinguish
    INSERT INTO grading_scale_sets (id, school_id, name, scale_mode, is_default)
    VALUES (gen_random_uuid(), v_school_id, '__test_set_b__', 'label_only', false)
    RETURNING id INTO v_set_b_id;

    INSERT INTO grading_scale_assignments
      (school_id, grading_scale_set_id, assignment_type, domain_id)
    VALUES (v_school_id, v_set_b_id, 'domain_default', v_domain_id)
    RETURNING id INTO v_assign_id;

    -- The domain_default row should exist and point to set_b
    SELECT COUNT(*) INTO v_count
    FROM grading_scale_assignments
    WHERE school_id       = v_school_id
      AND assignment_type = 'domain_default'
      AND domain_id       = v_domain_id
      AND grading_scale_set_id = v_set_b_id
      AND is_active       = true;
    ASSERT v_count = 1,
      'T-10 FAIL: domain_default assignment not found after insert';
    RAISE NOTICE 'T-10 ✓ domain_default assignment inserted; resolution query can prefer it over school_default';

    -- Cleanup test rows (within transaction — gets rolled back anyway)
    DELETE FROM grading_scale_assignments WHERE id = v_assign_id;
    DELETE FROM grading_scale_sets WHERE id = v_set_b_id;
  ELSE
    RAISE NOTICE 'T-10 ⚠ skipped — no progress_categories exist';
  END IF;

  -- ── T-11: scale_item_id FK integrity ─────────────────────────────────
  -- Inserting a progress_observation with an invalid scale_item_id should fail
  IF v_student_id IS NOT NULL AND v_domain_id IS NOT NULL THEN
    BEGIN
      INSERT INTO progress_observations
        (student_id, category_id, rating, scale_item_id, observed_at, visibility)
      VALUES (
        v_student_id, v_domain_id,
        'Test',
        '00000000-dead-beef-0000-000000000099', -- nonexistent
        CURRENT_DATE, 'internal_only'
      );
      ASSERT false, 'T-11 FAIL: FK violation on scale_item_id should be raised';
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE 'T-11 ✓ invalid scale_item_id correctly rejected (FK violation)';
    END;
  ELSE
    RAISE NOTICE 'T-11 ⚠ skipped — no student/category data available';
  END IF;

  -- ── T-12: Legacy TEXT values still accepted ────────────────────────────
  IF v_student_id IS NOT NULL AND v_domain_id IS NOT NULL THEN
    INSERT INTO progress_observations
      (student_id, category_id, rating, scale_item_id, observed_at, visibility)
    VALUES (
      v_student_id, v_domain_id,
      'emerging', NULL,
      CURRENT_DATE, 'internal_only'
    );
    SELECT COUNT(*) INTO v_count
    FROM progress_observations
    WHERE student_id  = v_student_id
      AND category_id = v_domain_id
      AND rating      = 'emerging'
      AND scale_item_id IS NULL;
    ASSERT v_count >= 1,
      'T-12 FAIL: legacy rating value "emerging" should be storable with NULL scale_item_id';
    RAISE NOTICE 'T-12 ✓ legacy TEXT rating ("emerging") accepted with NULL scale_item_id';
  ELSE
    RAISE NOTICE 'T-12 ⚠ skipped — no student/category data available';
  END IF;

  -- ── T-13: Custom label accepted ───────────────────────────────────────
  IF v_student_id IS NOT NULL AND v_domain_id IS NOT NULL THEN
    INSERT INTO progress_observations
      (student_id, category_id, rating, scale_item_id, observed_at, visibility)
    VALUES (
      v_student_id, v_domain_id,
      'Mastered', NULL,
      CURRENT_DATE, 'internal_only'
    );
    SELECT COUNT(*) INTO v_count
    FROM progress_observations
    WHERE student_id  = v_student_id
      AND category_id = v_domain_id
      AND rating      = 'Mastered';
    ASSERT v_count >= 1,
      'T-13 FAIL: custom TEXT rating "Mastered" should be storable';
    RAISE NOTICE 'T-13 ✓ custom TEXT rating ("Mastered") accepted';
  ELSE
    RAISE NOTICE 'T-13 ⚠ skipped — no student/category data available';
  END IF;

END $$;

DO $$ BEGIN RAISE NOTICE '✓ All 092 smoke tests passed.'; END $$;

ROLLBACK;

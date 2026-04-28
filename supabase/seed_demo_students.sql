-- ─────────────────────────────────────────────────────────────────────────────
-- Demo Student Seed — Pilot School (school ID: 00000000-0000-0000-0000-000000000001)
-- Sets up: academic periods, SY 2026-2027, promotion paths, 24 students
-- Run in: Supabase Dashboard → SQL Editor
--
-- This script is safe to re-run. The CLEANUP block at the top runs first,
-- wiping all students and the next-year scaffold, then re-seeds everything.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: CLEANUP
-- Removes ALL students for the pilot school (including any manually added ones),
-- clears the SY 2026-2027 year and its classes, and resets the seed periods.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Delete all students (cascades to guardians and enrollments via FK)
DELETE FROM students
  WHERE school_id = '00000000-0000-0000-0000-000000000001';

-- Remove the next school year created by this seed (and its classes)
DELETE FROM classes
  WHERE school_id = '00000000-0000-0000-0000-000000000001'
    AND school_year_id = '00000000-0000-0000-0000-000000000003';

DELETE FROM school_years
  WHERE id = '00000000-0000-0000-0000-000000000003';

-- Remove any academic periods previously created by this seed
DELETE FROM academic_periods
  WHERE id IN (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000012'
  );

-- Clear any promotion paths on existing classes
UPDATE classes
  SET next_class_id = NULL
  WHERE school_id = '00000000-0000-0000-0000-000000000001';


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: SEED
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _school      UUID := '00000000-0000-0000-0000-000000000001';
  _year_curr   UUID := '00000000-0000-0000-0000-000000000002'; -- SY 2025-2026 (active)
  _year_next   UUID := '00000000-0000-0000-0000-000000000003'; -- SY 2026-2027 (draft)

  -- Academic period IDs (fixed so this script is idempotent)
  _period_curr UUID := '00000000-0000-0000-0000-000000000010'; -- Regular Term · SY 2025-2026
  _period_next UUID := '00000000-0000-0000-0000-000000000012'; -- Regular Term · SY 2026-2027

  -- Class IDs resolved at runtime
  _toddler_curr UUID;
  _pk_curr      UUID;
  _kinder_curr  UUID;
  _pk_next      UUID;
  _kinder_next  UUID;

  _sid UUID;
BEGIN

  -- ── 1. Academic period for current year ─────────────────────────────────────
  INSERT INTO academic_periods (id, school_id, school_year_id, name, start_date, end_date, is_active)
  VALUES (_period_curr, _school, _year_curr, 'Regular Term', '2024-06-01', '2025-03-31', TRUE)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;

  RAISE NOTICE 'Period: Regular Term (SY 2025-2026) = %', _period_curr;

  -- ── 2. Create SY 2026-2027 (draft) ──────────────────────────────────────────
  INSERT INTO school_years (id, school_id, name, status, start_date, end_date)
  VALUES (_year_next, _school, 'SY 2026–2027', 'draft', '2026-06-01', '2027-03-31')
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. Academic period for next year ────────────────────────────────────────
  INSERT INTO academic_periods (id, school_id, school_year_id, name, start_date, end_date, is_active)
  VALUES (_period_next, _school, _year_next, 'Regular Term', '2026-06-01', '2027-03-31', FALSE)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  RAISE NOTICE 'Period: Regular Term (SY 2026-2027) = %', _period_next;

  -- ── 4. Resolve or create classes for SY 2025-2026 ───────────────────────────

  SELECT id INTO _toddler_curr FROM classes
    WHERE school_id = _school AND school_year_id = _year_curr
      AND (lower(name) LIKE '%toddler%' OR lower(level) LIKE '%toddler%')
    LIMIT 1;

  IF _toddler_curr IS NULL THEN
    INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time, capacity, is_active)
    VALUES (_school, _year_curr, 'Toddlers', 'Toddler', '08:00', '11:00', 15, TRUE)
    RETURNING id INTO _toddler_curr;
    RAISE NOTICE 'Created Toddlers class: %', _toddler_curr;
  ELSE
    RAISE NOTICE 'Using existing Toddlers class: %', _toddler_curr;
  END IF;

  SELECT id INTO _pk_curr FROM classes
    WHERE school_id = _school AND school_year_id = _year_curr
      AND (lower(name) LIKE '%pre-kinder%' OR lower(name) LIKE '%pre kinder%'
        OR lower(level) LIKE '%pre-kinder%' OR lower(level) LIKE '%pre kinder%')
    LIMIT 1;

  IF _pk_curr IS NULL THEN
    INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time, capacity, is_active)
    VALUES (_school, _year_curr, 'Pre-Kinder', 'Pre-Kinder', '08:00', '12:00', 20, TRUE)
    RETURNING id INTO _pk_curr;
    RAISE NOTICE 'Created Pre-Kinder class: %', _pk_curr;
  ELSE
    RAISE NOTICE 'Using existing Pre-Kinder class: %', _pk_curr;
  END IF;

  SELECT id INTO _kinder_curr FROM classes
    WHERE school_id = _school AND school_year_id = _year_curr
      AND (lower(name) LIKE '%kinder%' OR lower(level) LIKE '%kinder%')
      AND lower(name) NOT LIKE '%pre%' AND lower(level) NOT LIKE '%pre%'
    LIMIT 1;

  IF _kinder_curr IS NULL THEN
    INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time, capacity, is_active)
    VALUES (_school, _year_curr, 'Kinder', 'Kinder', '07:30', '12:30', 25, TRUE)
    RETURNING id INTO _kinder_curr;
    RAISE NOTICE 'Created Kinder class: %', _kinder_curr;
  ELSE
    RAISE NOTICE 'Using existing Kinder class: %', _kinder_curr;
  END IF;

  -- ── 5. Create classes for SY 2026-2027 ──────────────────────────────────────
  --   Pre-Kinder: receives Toddler promotions
  --   Kinder:     receives Pre-Kinder promotions
  --   (Kinder graduates move outside the school → no next class set)

  INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time, capacity, is_active)
  VALUES (_school, _year_next, 'Pre-Kinder', 'Pre-Kinder', '08:00', '12:00', 20, TRUE)
  RETURNING id INTO _pk_next;
  RAISE NOTICE 'Created Pre-Kinder 2026-2027: %', _pk_next;

  INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time, capacity, is_active)
  VALUES (_school, _year_next, 'Kinder', 'Kinder', '07:30', '12:30', 25, TRUE)
  RETURNING id INTO _kinder_next;
  RAISE NOTICE 'Created Kinder 2026-2027: %', _kinder_next;

  -- ── 6. Set promotion paths ───────────────────────────────────────────────────
  --   Toddlers → Pre-Kinder (next year)
  --   Pre-Kinder → Kinder (next year)
  --   Kinder → NULL (graduating, admin can skip or handle manually)

  UPDATE classes SET next_class_id = _pk_next     WHERE id = _toddler_curr;
  UPDATE classes SET next_class_id = _kinder_next WHERE id = _pk_curr;
  UPDATE classes SET next_class_id = NULL          WHERE id = _kinder_curr;

  RAISE NOTICE 'Promotion paths: Toddlers → PK(%), PK → Kinder(%), Kinder → graduating',
    _pk_next, _kinder_next;

  -- ── 7. Students ─────────────────────────────────────────────────────────────
  -- All 24 students are enrolled in "Regular Term · SY 2025-2026" (_period_curr).
  -- This is the source period you select in Promote Students to test the flow.


  -- ── TODDLERS (6 students) ───────────────────────────────────────────────────

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Sofia', 'Reyes', '2023-03-12', 'Female', 'STU-2025-001', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Maria Reyes', 'Mother', '0917-111-0001', 'maria.reyes@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _toddler_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Mateo', 'Santos', '2022-07-28', 'Male', 'STU-2025-002', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Ana Santos', 'Mother', '0917-111-0002', 'ana.santos@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _toddler_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Isabella', 'Cruz', '2023-01-05', 'Female', 'STU-2025-003', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Rosa Cruz', 'Mother', '0917-111-0003', 'rosa.cruz@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _toddler_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Elijah', 'Garcia', '2022-11-19', 'Male', 'STU-2025-004', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Carlos Garcia', 'Father', '0917-111-0004', 'carlos.garcia@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _toddler_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Mia', 'Torres', '2023-05-22', 'Female', 'STU-2025-005', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Elena Torres', 'Mother', '0917-111-0005', 'elena.torres@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _toddler_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Lucas', 'Flores', '2022-09-14', 'Male', 'STU-2025-006', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Gloria Flores', 'Mother', '0917-111-0006', 'gloria.flores@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _toddler_curr, _year_curr, _period_curr, 'enrolled', NOW());


  -- ── PRE-KINDER (8 students) ─────────────────────────────────────────────────

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Chloe', 'Mendoza', '2021-02-18', 'Female', 'STU-2025-007', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Jasmine Mendoza', 'Mother', '0917-222-0001', 'jasmine.mendoza@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Nathan', 'Ramos', '2020-08-30', 'Male', 'STU-2025-008', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Lily Ramos', 'Mother', '0917-222-0002', 'lily.ramos@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Gabriela', 'Aquino', '2021-04-07', 'Female', 'STU-2025-009', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Christine Aquino', 'Mother', '0917-222-0003', 'christine.aquino@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Ethan', 'Villanueva', '2020-12-25', 'Male', 'STU-2025-010', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Marco Villanueva', 'Father', '0917-222-0004', 'marco.villanueva@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Zoe', 'Bautista', '2021-06-15', 'Female', 'STU-2025-011', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Rachel Bautista', 'Mother', '0917-222-0005', 'rachel.bautista@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Diego', 'Lim', '2020-10-03', 'Male', 'STU-2025-012', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Patricia Lim', 'Mother', '0917-222-0006', 'patricia.lim@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Emma', 'Gonzalez', '2021-03-21', 'Female', 'STU-2025-013', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Sandra Gonzalez', 'Mother', '0917-222-0007', 'sandra.gonzalez@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Liam', 'Dela Cruz', '2020-07-11', 'Male', 'STU-2025-014', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Bernard Dela Cruz', 'Father', '0917-222-0008', 'bernard.delacruz@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _pk_curr, _year_curr, _period_curr, 'enrolled', NOW());


  -- ── KINDER (10 students) ────────────────────────────────────────────────────

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Andrea', 'Castro', '2019-08-09', 'Female', 'STU-2025-015', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Maricel Castro', 'Mother', '0917-333-0001', 'maricel.castro@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Raphael', 'Rivera', '2019-04-17', 'Male', 'STU-2025-016', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Jose Rivera', 'Father', '0917-333-0002', 'jose.rivera@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Bianca', 'Morales', '2020-01-30', 'Female', 'STU-2025-017', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Theresa Morales', 'Mother', '0917-333-0003', 'theresa.morales@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Carlos', 'Vergara', '2019-11-23', 'Male', 'STU-2025-018', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Luisa Vergara', 'Mother', '0917-333-0004', 'luisa.vergara@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Camille', 'Tan', '2019-06-04', 'Female', 'STU-2025-019', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Grace Tan', 'Mother', '0917-333-0005', 'grace.tan@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Miguel', 'Go', '2020-03-16', 'Male', 'STU-2025-020', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Henry Go', 'Father', '0917-333-0006', 'henry.go@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Isabelle', 'Navarro', '2019-09-02', 'Female', 'STU-2025-021', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Carmen Navarro', 'Mother', '0917-333-0007', 'carmen.navarro@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Paolo', 'Soriano', '2019-12-10', 'Male', 'STU-2025-022', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Maribel Soriano', 'Mother', '0917-333-0008', 'maribel.soriano@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Daniela', 'Ocampo', '2020-02-25', 'Female', 'STU-2025-023', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Rowena Ocampo', 'Mother', '0917-333-0009', 'rowena.ocampo@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());

  INSERT INTO students (school_id, first_name, last_name, date_of_birth, gender, student_code, is_active)
    VALUES (_school, 'Joshua', 'Pascual', '2019-07-18', 'Male', 'STU-2025-024', TRUE) RETURNING id INTO _sid;
  INSERT INTO guardians (student_id, full_name, relationship, phone, email, is_primary, is_emergency_contact)
    VALUES (_sid, 'Irene Pascual', 'Mother', '0917-333-0010', 'irene.pascual@demo.com', TRUE, TRUE);
  INSERT INTO enrollments (student_id, class_id, school_year_id, academic_period_id, status, enrolled_at)
    VALUES (_sid, _kinder_curr, _year_curr, _period_curr, 'enrolled', NOW());


  RAISE NOTICE '✓ Seeded 24 students (6 Toddlers · 8 Pre-Kinder · 10 Kinder)';
  RAISE NOTICE '✓ All enrolled in: Regular Term · SY 2025-2026';
  RAISE NOTICE '✓ Promotion paths set: Toddlers→PK(next), PK→Kinder(next), Kinder→graduating';
  RAISE NOTICE '';
  RAISE NOTICE 'To test Promote Students:';
  RAISE NOTICE '  Source: Regular Term · SY 2025–2026';
  RAISE NOTICE '  Target: Regular Term · SY 2026–2027';

END $$;

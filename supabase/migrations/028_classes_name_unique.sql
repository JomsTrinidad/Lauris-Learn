-- Enforce unique class names per school year at the DB level.
-- Run ONLY after deduplicating any existing classes with the same name in the same school year.
-- Check first: SELECT school_year_id, name, COUNT(*) FROM classes GROUP BY school_year_id, name HAVING COUNT(*) > 1;
-- If that returns rows, rename the duplicate classes before running this migration.

ALTER TABLE classes
  ADD CONSTRAINT classes_name_school_year_unique UNIQUE (school_year_id, name);

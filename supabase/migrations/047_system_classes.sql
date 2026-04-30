-- 047_system_classes.sql
-- Adds is_system flag to classes to support level-based enrollment.
--
-- "Unassigned" placeholder classes (is_system = TRUE) are auto-created by the
-- enroll API when a student is enrolled by level before a section is assigned.
-- They are hidden from all normal class dropdowns and UIs.
-- Section placement later moves the student from the placeholder to a real class.

ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Prevent these from appearing in reports or capacity calculations
CREATE INDEX IF NOT EXISTS idx_classes_is_system ON classes (school_id, school_year_id, is_system);

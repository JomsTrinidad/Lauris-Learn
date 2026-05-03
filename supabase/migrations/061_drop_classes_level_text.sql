-- Cleanup of the dual-write transition introduced in 060_class_levels.sql.
-- All read/write paths now consume class_levels via FK; the denormalized
-- classes.level text column is no longer the source of anything.
--
-- This migration must be applied AFTER the app code that selects
-- class_levels(name) instead of classes.level has been deployed.

DROP TRIGGER IF EXISTS classes_sync_level_text ON classes;
DROP TRIGGER IF EXISTS class_levels_cascade_rename ON class_levels;

DROP FUNCTION IF EXISTS sync_class_level_text();
DROP FUNCTION IF EXISTS cascade_class_level_rename();

ALTER TABLE classes DROP COLUMN IF EXISTS level;

-- 048_fee_type_secures_placement.sql
-- Adds a per-school payment gate for section placement.
--
-- When a fee type has secures_placement = TRUE, students in Pending Section
-- Placement cannot be moved to a real class section until a paid billing
-- record exists for them in the current school year.
-- At most one fee type per school should have this set to TRUE.

ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS secures_placement BOOLEAN NOT NULL DEFAULT FALSE;

-- Progression order for core class levels.
--
-- Purpose: deterministic ordering of core levels so the app can auto-detect:
--   - terminal levels (highest progression_order → graduation suggestion)
--   - next level (next higher progression_order → eligible/promote suggestion)
--
-- Only meaningful for kind='core' levels. Non-core kinds (sped, bridge, summer,
-- mixed_age, enrichment, other) should leave progression_order NULL.
--
-- The existing classes.next_level sentinel system ("GRADUATE", "NON_PROMOTIONAL",
-- or a level-name string) continues to work unchanged — progression_order is an
-- additive layer that enables order-based auto-suggestions without per-class config.

ALTER TABLE class_levels
  ADD COLUMN IF NOT EXISTS progression_order INT NULL;

-- Enforce uniqueness per school: no two levels share the same progression_order.
-- NULL values are excluded, so multiple unordered (non-core) levels are fine.
CREATE UNIQUE INDEX IF NOT EXISTS class_levels_progression_order_unique
  ON class_levels (school_id, progression_order)
  WHERE progression_order IS NOT NULL;

-- No automatic backfill — admins assign progression_order via
-- Settings > Class Levels for their core levels.

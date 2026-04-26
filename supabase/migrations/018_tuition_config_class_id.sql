-- Migration 018: Add class_id and monthly_amount to tuition_configs
-- Enables per-class config mapping in billing generation (replaces level-string matching)

ALTER TABLE tuition_configs
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(10,2);

-- Backfill monthly_amount for all existing records
UPDATE tuition_configs
SET monthly_amount = CASE
  WHEN months > 0 THEN ROUND(total_amount::numeric / months, 2)
  ELSE total_amount
END
WHERE monthly_amount IS NULL;

-- Drop old level-based unique constraint (now replaced by class_id index)
ALTER TABLE tuition_configs
  DROP CONSTRAINT IF EXISTS tuition_configs_academic_period_id_level_key;

-- Partial unique index: one config per class per academic period (for class-based configs)
CREATE UNIQUE INDEX IF NOT EXISTS tuition_configs_period_class_unique
  ON tuition_configs (academic_period_id, class_id)
  WHERE class_id IS NOT NULL;

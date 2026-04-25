-- Migration 007: Add default_amount to fee_types for billing auto-fill

ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS default_amount numeric(10,2);

-- Backfill seed data amounts if you want defaults
-- UPDATE fee_types SET default_amount = 3500 WHERE name = 'Monthly Tuition';

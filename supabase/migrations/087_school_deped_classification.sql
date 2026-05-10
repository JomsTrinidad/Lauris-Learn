-- ============================================================
-- Migration 087 – School DepEd classification fields (additive)
--
-- Adds region, schools_division, and district to the schools
-- table so IEP plans can auto-populate these from Settings.
--
-- NULL-safe: all columns are nullable; existing rows are
-- unaffected. No new RLS policies required (existing school-
-- scoped policies cover the new columns).
-- ============================================================

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS region           TEXT,
  ADD COLUMN IF NOT EXISTS schools_division TEXT,
  ADD COLUMN IF NOT EXISTS district         TEXT;

-- ============================================================
-- End of Migration 087
-- ============================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Migration 053: School Year Lifecycle
--
-- • Adds 'planned' and 'closed' to school_year_status enum.
--   (PostgreSQL does not allow removing enum values, so 'draft' and 'archived'
--    remain in the type but are no longer used by new data.)
-- • Migrates all existing 'draft' → 'planned' and 'archived' → 'closed'.
-- • Adds enrollment_balance_policy to schools:
--     warn   – allow enrollment but show prior-year balance warning (default)
--     block  – block enrollment until outstanding balance is cleared
--     allow  – silently allow enrollment regardless of balance
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Extend the enum
ALTER TYPE school_year_status ADD VALUE IF NOT EXISTS 'planned';
ALTER TYPE school_year_status ADD VALUE IF NOT EXISTS 'closed';

-- 2. Migrate existing rows
UPDATE school_years SET status = 'planned' WHERE status = 'draft';
UPDATE school_years SET status = 'closed'  WHERE status = 'archived';

-- 3. Add enrollment balance policy to schools
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS enrollment_balance_policy TEXT NOT NULL DEFAULT 'warn'
    CHECK (enrollment_balance_policy IN ('warn', 'block', 'allow'));

-- 4. Super-admin RLS bypass for the new column (matches pattern from migration 002)
--    No separate policy needed — the existing super_admin_all_schools policy covers it.

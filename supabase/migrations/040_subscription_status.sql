-- 040_subscription_status.sql
-- Adds subscription lifecycle tracking to the schools table.
--
-- Background: trial_status ('active'/'expired'/'converted') tracks the free-trial window.
-- subscription_status tracks the paid-subscription state independently so the platform
-- owner can suspend or mark a school past-due without touching the trial record.
--
-- Behavior rules enforced by application code (not DB triggers):
--   trial        → trial running; app reads trial_status/trial_end_date for days-left
--   active       → paying subscriber; full access
--   past_due     → payment lapsed; warn school admin but do NOT hard-block (grace period)
--   suspended    → platform owner manually blocked; read-only (same as expired trial)
--   cancelled    → subscription cancelled; same hard-block as suspended
--
-- is_demo marks test/demo schools so they are excluded from revenue reports and
-- can be given an indefinite trial without triggering expiry warnings.

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS subscription_status       TEXT NOT NULL DEFAULT 'trial'
    CONSTRAINT schools_subscription_status_check
      CHECK (subscription_status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  ADD COLUMN IF NOT EXISTS billing_plan              TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle             TEXT NOT NULL DEFAULT 'monthly'
    CONSTRAINT schools_billing_cycle_check
      CHECK (billing_cycle IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS subscription_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_demo                   BOOLEAN NOT NULL DEFAULT FALSE;

-- Index: super-admin dashboard filters by subscription_status frequently
CREATE INDEX IF NOT EXISTS idx_schools_subscription_status
  ON schools (subscription_status);

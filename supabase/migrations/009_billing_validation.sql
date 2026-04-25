-- Migration 009: Billing validation guardrails
-- Add missing billing statuses (safe: IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cancelled' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'billing_status')) THEN
    ALTER TYPE billing_status ADD VALUE 'cancelled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'refunded' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'billing_status')) THEN
    ALTER TYPE billing_status ADD VALUE 'refunded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'waived' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'billing_status')) THEN
    ALTER TYPE billing_status ADD VALUE 'waived';
  END IF;
END $$;

-- Audit columns on billing_records
ALTER TABLE billing_records
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS changed_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS changed_at  TIMESTAMPTZ;

-- Track who recorded each payment
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);

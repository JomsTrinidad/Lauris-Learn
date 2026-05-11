-- Migration 083: Add submission audit fields to student_plans
-- Additive only — no data migration needed; existing rows keep NULL (legacy fallback handled in app).

ALTER TABLE student_plans
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index supports review-queue ORDER BY submitted_at ASC on the pending statuses.
CREATE INDEX IF NOT EXISTS idx_student_plans_submitted_at
  ON student_plans (submitted_at ASC NULLS LAST)
  WHERE status IN ('submitted', 'in_review');

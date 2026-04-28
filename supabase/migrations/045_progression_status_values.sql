-- Widen the progression_status CHECK constraint on enrollments to include
-- the year-end classification values used by the Year-End Classification feature.
ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS enrollments_progression_status_check;

ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_progression_status_check
  CHECK (progression_status IN (
    'eligible',
    'not_eligible_retained',
    'not_eligible_other',
    'graduated',
    'not_continuing',
    'promoted_pending_placement',
    'placed',
    'intent_confirmed',
    'slot_reserved',
    'undecided'
  ));

-- Year-End Classification gained a 'withdrawn' outcome (mid-year exit) but the
-- enrollments.progression_status CHECK constraint last set in migration 045
-- predates it. Saving "Withdrawn" via either the bulk Year-End flow or the
-- per-student dropdown errors out as:
--   new row for relation "enrollments" violates check constraint
--   "enrollments_progression_status_check"
--
-- Widen the constraint to allow 'withdrawn'.

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
    'withdrawn',
    'promoted_pending_placement',
    'placed',
    'intent_confirmed',
    'slot_reserved',
    'undecided'
  ));

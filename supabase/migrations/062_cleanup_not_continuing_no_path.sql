-- Cleanup: Year-End Classification "Not Continuing" was showing on classes
-- with no real next level (graduating classes, or classes with an unset
-- promotion path). The UI now hides that button there, but any pre-existing
-- enrollments saved with progression_status = 'not_continuing' against such
-- classes are stale picks that should be reconciled.
--
-- Strategy:
--   - GRADUATE classes (next_level = 'GRADUATE'): convert to 'graduated'.
--     The student finished the program; that's what was actually meant.
--   - Unset paths (next_level IS NULL or empty): null out so admin
--     re-classifies once the Promotion Path is configured.
--
-- Also nulls out the three legacy progression_status values that the new
-- per-student "Year-End Classification" dropdown no longer offers:
-- 'intent_confirmed', 'slot_reserved', 'undecided'. These had no readers
-- in app code and represent data that can't be re-saved through the UI.

-- ── 1. Reconcile not_continuing on classes with no real next level ────────
UPDATE enrollments e
SET progression_status = 'graduated',
    progression_notes  = COALESCE(progression_notes, '') ||
                         CASE WHEN progression_notes IS NOT NULL AND progression_notes <> ''
                              THEN ' (auto-converted from not_continuing — graduating class)'
                              ELSE 'Auto-converted from not_continuing — graduating class'
                         END
FROM classes c
WHERE e.class_id = c.id
  AND e.progression_status = 'not_continuing'
  AND c.next_level = 'GRADUATE';

UPDATE enrollments e
SET progression_status = NULL,
    progression_notes  = COALESCE(progression_notes, '') ||
                         CASE WHEN progression_notes IS NOT NULL AND progression_notes <> ''
                              THEN ' (cleared from not_continuing — no promotion path was set)'
                              ELSE 'Cleared from not_continuing — no promotion path was set'
                         END
FROM classes c
WHERE e.class_id = c.id
  AND e.progression_status = 'not_continuing'
  AND (c.next_level IS NULL OR c.next_level = '');

-- ── 2. Null out legacy values no longer offered by the UI ─────────────────
UPDATE enrollments
SET progression_status = NULL
WHERE progression_status IN ('intent_confirmed', 'slot_reserved', 'undecided');

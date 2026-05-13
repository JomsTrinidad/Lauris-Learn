-- Migration 093: Add event_type classification to events
-- Strictly additive — one new TEXT column with DEFAULT + CHECK; backfills
-- existing holiday rows based on their description text.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'school_event'
    CHECK (event_type IN (
      'school_event',   -- School-wide programs, ceremonies, activities
      'class_event',    -- Class-specific activities (field trips, picture day, etc.)
      'holiday',        -- Public holidays / no-class days
      'deadline',       -- Submission or permission deadlines (action needed)
      'meeting',        -- Parent-Teacher Conferences and similar meetings
      'online_class'    -- Scheduled online sessions
    ));

-- Backfill: mark rows whose description signals a no-class holiday.
-- The seed data uses "Regular Holiday — No classes." and
-- "Special Non-Working Holiday — No classes." as description text.
UPDATE events
SET event_type = 'holiday'
WHERE event_type = 'school_event'
  AND description IS NOT NULL
  AND description ILIKE '%no classes%';

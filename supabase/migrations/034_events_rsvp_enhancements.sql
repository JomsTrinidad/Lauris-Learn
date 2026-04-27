-- 034_events_rsvp_enhancements.sql
-- Adds: requires_rsvp toggle, all_day flag, max_companions limit on events
--       companions count and notes on event_rsvps

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS requires_rsvp  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS all_day        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_companions INTEGER;

-- Existing events keep requires_rsvp = true (existing behavior)
-- max_companions = NULL means companion tracking is disabled for that event

ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS companions  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes       TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

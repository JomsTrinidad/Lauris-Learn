-- Add companion_names array to event_rsvps so parents can list who is joining
ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS companion_names TEXT[] DEFAULT '{}';

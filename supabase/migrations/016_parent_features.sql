-- 016_parent_features.sql
-- Adds: absence_notifications table, event_rsvps RLS + unique index, progress_observations parent read policy

-- ─── 1. absence_notifications ─────────────────────────────────────────────────
-- Parents submit a heads-up when their child won't be in school.
-- One report per child per day (unique constraint). Teacher attendance is still
-- the source of truth; this is a notification, not an attendance record.

CREATE TABLE IF NOT EXISTS absence_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID        NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id    UUID                 REFERENCES classes(id),
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  reason      TEXT,
  parent_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT absence_notifications_student_date_unique UNIQUE (student_id, date)
);

ALTER TABLE absence_notifications ENABLE ROW LEVEL SECURITY;

-- Parents can insert for their own children (matched by guardian email)
CREATE POLICY "parents_insert_absence_notifications"
  ON absence_notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = absence_notifications.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- Parents can read their own children's notifications
CREATE POLICY "parents_select_absence_notifications"
  ON absence_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = absence_notifications.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- School staff can read all notifications for their school
CREATE POLICY "school_members_select_absence_notifications"
  ON absence_notifications FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );


-- ─── 2. event_rsvps — unique index + RLS ──────────────────────────────────────
-- Unique index allows upsert on (event_id, student_id).
-- NULL student_id rows (if any) are unaffected (NULLs are never equal in indexes).

CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_event_student_unique
  ON event_rsvps (event_id, student_id);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Parents can insert / update / delete RSVPs for their own children
CREATE POLICY "parents_manage_event_rsvps"
  ON event_rsvps
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = event_rsvps.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = event_rsvps.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

-- School staff can read all RSVPs for events at their school
CREATE POLICY "school_members_select_event_rsvps"
  ON event_rsvps FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN profiles p ON p.school_id = e.school_id
      WHERE p.id = auth.uid()
    )
  );


-- ─── 3. progress_observations — parent read policy ────────────────────────────
-- Parents can read observations for their own children where visibility = 'parent_visible'

CREATE POLICY "parents_select_progress_observations"
  ON progress_observations FOR SELECT
  USING (
    visibility = 'parent_visible'
    AND EXISTS (
      SELECT 1 FROM guardians g
      WHERE g.student_id = progress_observations.student_id
        AND g.email = (auth.jwt() ->> 'email')
    )
  );

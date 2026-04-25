-- 005_grading_progression_invites.sql
-- Configurable grading scales, student progression tracking, guardian invite tokens

-- ── Grading Scales ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grading_scales (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  description text,
  color       text        NOT NULL DEFAULT '#6b7280',
  min_score   numeric,
  max_score   numeric,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_member_grading_scales" ON grading_scales
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  );

CREATE INDEX IF NOT EXISTS grading_scales_school_idx ON grading_scales(school_id, sort_order);

-- Seed default grading scale for BK (pilot school)
INSERT INTO grading_scales (school_id, label, description, color, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Emerging',   'Beginning to show understanding',      '#ef4444', 1),
  ('00000000-0000-0000-0000-000000000001', 'Developing',  'Showing growth with support',          '#f97316', 2),
  ('00000000-0000-0000-0000-000000000001', 'Consistent',  'Demonstrates skill independently',     '#22c55e', 3),
  ('00000000-0000-0000-0000-000000000001', 'Advanced',    'Exceeds expectations',                 '#6366f1', 4)
ON CONFLICT DO NOTHING;

-- ── Student Progression (on enrollments) ─────────────────────────────────────

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS progression_status text
    CHECK (progression_status IN ('eligible','intent_confirmed','slot_reserved','not_continuing','undecided'));

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS progression_notes text;

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS slot_reserved_at timestamptz;

-- ── Guardian Invite Tokens ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guardian_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id uuid        REFERENCES guardians(id) ON DELETE SET NULL,
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64'),
  email       text,
  expires_at  timestamptz DEFAULT (now() + interval '30 days'),
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE guardian_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_member_guardian_invites" ON guardian_invites
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  );

-- Public read for token-based access (parent follows invite link)
CREATE POLICY "public_invite_token_read" ON guardian_invites
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS guardian_invites_token_idx   ON guardian_invites(token);
CREATE INDEX IF NOT EXISTS guardian_invites_school_idx  ON guardian_invites(school_id);
CREATE INDEX IF NOT EXISTS guardian_invites_student_idx ON guardian_invites(student_id);

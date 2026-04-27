-- 029_grading_scale_sets.sql
-- Grading scale sets: group related scale items, add scale_mode, enable templates

-- ── Scale Sets (groups of related grading levels) ─────────────────────────────

CREATE TABLE IF NOT EXISTS grading_scale_sets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  -- scale_mode controls whether items use numeric score ranges or are descriptive-only
  scale_mode  text        NOT NULL DEFAULT 'label_only'
              CHECK (scale_mode IN ('label_only', 'range_based')),
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE grading_scale_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_member_grading_scale_sets" ON grading_scale_sets
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  );

-- Only one default set per school
CREATE UNIQUE INDEX IF NOT EXISTS grading_scale_sets_default_idx
  ON grading_scale_sets(school_id) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS grading_scale_sets_school_idx
  ON grading_scale_sets(school_id);

-- ── Link existing grading_scales items to sets ────────────────────────────────

-- Add scale_set_id FK to existing grading_scales table.
-- ON DELETE CASCADE: deleting a set automatically removes all its items.
ALTER TABLE grading_scales
  ADD COLUMN IF NOT EXISTS scale_set_id uuid
    REFERENCES grading_scale_sets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS grading_scales_set_idx
  ON grading_scales(scale_set_id);

-- ── Seed default set for BK pilot school ────────────────────────────────────

-- Create a "Preschool Development Scale" set for the pilot school
INSERT INTO grading_scale_sets (id, school_id, name, description, scale_mode, is_default)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Preschool Development Scale',
  'A simple developmental scale for tracking how consistently a child demonstrates a skill without forcing numeric scores.',
  'label_only',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Link existing BK scale items to this default set
UPDATE grading_scales
SET scale_set_id = '00000000-0000-0000-0000-000000000003'
WHERE school_id = '00000000-0000-0000-0000-000000000001'
  AND scale_set_id IS NULL;

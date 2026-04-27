-- 035_proud_moments.sql
-- Adds: proud_moments and proud_moment_reactions tables

CREATE TABLE proud_moments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  category    TEXT        NOT NULL,
  note        TEXT,
  photo_path  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE proud_moment_reactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proud_moment_id UUID        NOT NULL REFERENCES proud_moments(id) ON DELETE CASCADE,
  parent_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type   TEXT        NOT NULL CHECK (reaction_type IN ('proud', 'great_job', 'keep_going')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proud_moment_id, parent_id)
);

ALTER TABLE proud_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE proud_moment_reactions ENABLE ROW LEVEL SECURITY;

-- Staff: view moments for their school
CREATE POLICY "staff_select_proud_moments" ON proud_moments
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );

-- Staff: insert moments for their school
CREATE POLICY "staff_insert_proud_moments" ON proud_moments
  FOR INSERT WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );

-- Staff: delete their own moments
CREATE POLICY "staff_delete_proud_moments" ON proud_moments
  FOR DELETE USING (created_by = auth.uid());

-- Parents: view moments for their children
CREATE POLICY "parents_select_proud_moments" ON proud_moments
  FOR SELECT USING (student_id = ANY(parent_student_ids()));

-- Parents: manage their own reactions
CREATE POLICY "parents_all_reactions" ON proud_moment_reactions
  FOR ALL USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Staff: view reactions on their school's moments
CREATE POLICY "staff_select_reactions" ON proud_moment_reactions
  FOR SELECT USING (
    proud_moment_id IN (
      SELECT id FROM proud_moments
      WHERE school_id IN (
        SELECT school_id FROM profiles
        WHERE id = auth.uid() AND school_id IS NOT NULL
      )
    )
  );

-- Super admin bypass
CREATE POLICY "super_admin_all_proud_moments" ON proud_moments
  FOR ALL USING (is_super_admin());

CREATE POLICY "super_admin_all_reactions" ON proud_moment_reactions
  FOR ALL USING (is_super_admin());

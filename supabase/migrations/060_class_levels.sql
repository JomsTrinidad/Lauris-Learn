-- Class Levels: school-scoped catalog for class level/age-group dropdowns.
-- Replaces the free-form `classes.level` text input with a managed list,
-- accommodating non-linear paths (SPED, bridge, summer, mixed-age, enrichment).
--
-- Strategy: dual-write transition
--   - `classes.level_id` becomes the canonical FK
--   - `classes.level` text stays as a denormalized name copy for backward-compat
--     across read sites (billing, enrollment, finance, students)
--   - Triggers keep them in sync: renaming a level cascades automatically

-- ── 1. class_levels table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_levels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'core'
                CHECK (kind IN ('core','sped','bridge','summer','mixed_age','enrichment','other')),
  display_order INT  NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS class_levels_school_active_idx
  ON class_levels (school_id, archived_at, display_order);

ALTER TABLE class_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_levels_select ON class_levels;
CREATE POLICY class_levels_select ON class_levels
  FOR SELECT
  USING (
    is_super_admin()
    OR school_id = current_user_school_id()
  );

DROP POLICY IF EXISTS class_levels_insert ON class_levels;
CREATE POLICY class_levels_insert ON class_levels
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (current_user_role() = 'school_admin' AND school_id = current_user_school_id())
  );

DROP POLICY IF EXISTS class_levels_update ON class_levels;
CREATE POLICY class_levels_update ON class_levels
  FOR UPDATE
  USING (
    is_super_admin()
    OR (current_user_role() = 'school_admin' AND school_id = current_user_school_id())
  )
  WITH CHECK (
    is_super_admin()
    OR (current_user_role() = 'school_admin' AND school_id = current_user_school_id())
  );

DROP POLICY IF EXISTS class_levels_delete ON class_levels;
CREATE POLICY class_levels_delete ON class_levels
  FOR DELETE
  USING (
    is_super_admin()
    OR (current_user_role() = 'school_admin' AND school_id = current_user_school_id())
  );

-- ── 2. seed from existing distinct classes.level values ──────────────────
INSERT INTO class_levels (school_id, name, kind, display_order)
SELECT DISTINCT school_id, level, 'core', 0
FROM classes
WHERE level IS NOT NULL AND level <> ''
ON CONFLICT (school_id, name) DO NOTHING;

-- ── 3. classes.level_id FK column ─────────────────────────────────────────
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS level_id UUID NULL
  REFERENCES class_levels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS classes_level_id_idx ON classes(level_id);

-- Backfill level_id from existing level text
UPDATE classes c
SET level_id = cl.id
FROM class_levels cl
WHERE c.school_id = cl.school_id
  AND c.level IS NOT NULL
  AND c.level = cl.name
  AND c.level_id IS NULL;

-- ── 4. sync trigger: keep classes.level (text) ↔ class_levels.name ────────
-- On classes INSERT/UPDATE: if level_id set, copy name into level text
CREATE OR REPLACE FUNCTION sync_class_level_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.level_id IS NOT NULL THEN
    SELECT name INTO NEW.level
    FROM class_levels
    WHERE id = NEW.level_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classes_sync_level_text ON classes;
CREATE TRIGGER classes_sync_level_text
  BEFORE INSERT OR UPDATE OF level_id ON classes
  FOR EACH ROW
  EXECUTE FUNCTION sync_class_level_text();

-- On class_levels.name UPDATE: cascade rename to all referencing classes
CREATE OR REPLACE FUNCTION cascade_class_level_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE classes
    SET level = NEW.name
    WHERE level_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_levels_cascade_rename ON class_levels;
CREATE TRIGGER class_levels_cascade_rename
  AFTER UPDATE OF name ON class_levels
  FOR EACH ROW
  EXECUTE FUNCTION cascade_class_level_rename();

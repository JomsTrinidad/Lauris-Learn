-- Replace next_class_id-based promotion path with a direct next_level text field
ALTER TABLE classes ADD COLUMN IF NOT EXISTS next_level TEXT;

-- Migrate existing data: populate next_level from the linked next_class's level
UPDATE classes c
SET next_level = nc.level
FROM classes nc
WHERE c.next_class_id = nc.id
  AND c.next_class_id IS NOT NULL
  AND nc.level IS NOT NULL;

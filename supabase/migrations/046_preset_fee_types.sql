-- Migration 046: Refresh demo school fee types with a comprehensive preset list
-- Renames generic labels to purpose-specific ones and adds Uniform & Supplies.
-- Only touches the BK demo school seed data.

-- Rename existing generic fee types
UPDATE fee_types
SET name = 'Learning Materials', description = 'Textbooks, workbooks, and learning kits'
WHERE school_id = '00000000-0000-0000-0000-000000000001' AND name = 'Books';

UPDATE fee_types
SET description = 'One-time registration and enrollment fee'
WHERE school_id = '00000000-0000-0000-0000-000000000001' AND name = 'Enrollment Fee';

UPDATE fee_types
SET name = 'Activity & Optional Fees', description = 'Field trips, school events, and optional programs'
WHERE school_id = '00000000-0000-0000-0000-000000000001' AND name = 'Activity Fee';

UPDATE fee_types
SET name = 'External Fees', description = 'Government requirements, insurance, and non-school charges'
WHERE school_id = '00000000-0000-0000-0000-000000000001' AND name = 'Miscellaneous';

-- Add the missing preset
INSERT INTO fee_types (school_id, name, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'Uniform & Supplies', 'School uniforms, PE attire, and classroom supplies')
ON CONFLICT DO NOTHING;

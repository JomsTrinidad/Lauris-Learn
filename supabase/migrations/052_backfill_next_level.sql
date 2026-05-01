-- Backfill next_level for classes created before the Promotion Path feature
-- (migration 050) was introduced. Uses level/name pattern-matching to infer
-- the correct sentinel. Rules are applied in priority order; the IS NULL guard
-- on each UPDATE ensures no class is processed twice.

-- 1. Non-promotional classes — identified by name keywords.
--    Run first so these are not overwritten by the level-based rules below.
UPDATE classes
SET next_level = 'NON_PROMOTIONAL'
WHERE next_level IS NULL
  AND (
    lower(name) LIKE '%summer%'
    OR lower(name) LIKE '%bridge%'
    OR lower(name) LIKE '%enrichment%'
    OR lower(name) LIKE '%trial%'
    OR lower(name) LIKE '%readiness%'
    OR lower(name) LIKE '%mixed%age%'
    OR lower(name) LIKE '%after%school%'
  );

-- 2. Toddler / Nursery / Playgroup levels → next level is Pre-Kinder.
UPDATE classes
SET next_level = 'Pre-Kinder'
WHERE next_level IS NULL
  AND (
    lower(level) LIKE '%toddler%'
    OR lower(level) LIKE '%nursery%'
    OR lower(level) LIKE '%playgroup%'
  );

-- 3. Pre-Kinder level → next level is Kinder.
--    The '%pre%kinder%' pattern covers "Pre-Kinder", "Pre Kinder", etc.
UPDATE classes
SET next_level = 'Kinder'
WHERE next_level IS NULL
  AND lower(level) LIKE '%pre%kinder%';

-- 4. Kinder and Grade levels → terminal; mark as GRADUATE.
--    NOT LIKE '%pre%' guards against any Pre-Kinder rows not caught by step 3.
UPDATE classes
SET next_level = 'GRADUATE'
WHERE next_level IS NULL
  AND (
    (lower(level) LIKE '%kinder%' AND lower(level) NOT LIKE '%pre%')
    OR lower(level) LIKE '%grade%'
  );

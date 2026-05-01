-- Canonicalize the terminal promotion-path sentinel to uppercase GRADUATE.
-- Any row previously saved as the display-form "Graduate" is normalised here.
-- NON_PROMOTIONAL sentinel is introduced for summer/bridge/enrichment classes;
-- no existing rows use it yet, so no data migration is needed for that value.
UPDATE classes
SET next_level = 'GRADUATE'
WHERE next_level = 'Graduate';

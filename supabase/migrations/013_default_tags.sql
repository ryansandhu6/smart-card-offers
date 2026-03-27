-- migration 013: backfill null tags and add column default
-- 1. Backfill: set tags = '{}' for all rows where tags IS NULL
-- 2. Column default: future inserts without an explicit tags value get '{}'

UPDATE credit_cards
SET tags = '{}'
WHERE tags IS NULL;

ALTER TABLE credit_cards
  ALTER COLUMN tags SET DEFAULT '{}';

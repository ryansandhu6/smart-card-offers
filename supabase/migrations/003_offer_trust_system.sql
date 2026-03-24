-- Migration 003: Add data trust / priority system to card_offers
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → paste → Run

ALTER TABLE card_offers
  ADD COLUMN IF NOT EXISTS source_priority  INTEGER      NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS last_seen_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER;

-- Backfill last_seen_at from scraped_at so existing rows don't get marked stale immediately
UPDATE card_offers
   SET last_seen_at = COALESCE(scraped_at, created_at)
 WHERE last_seen_at IS NULL;

-- source_priority values:
--   1 = bank-direct scraper   (most trusted)
--   2 = aggregator scraper
--   3 = hardcoded / manual

-- Backfill existing rows: is_verified=true rows get priority 1
UPDATE card_offers SET source_priority = 1 WHERE is_verified = true;

-- Indexes for the new sort order and stale sweep
CREATE INDEX IF NOT EXISTS idx_offers_priority_points
  ON card_offers(source_priority ASC, points_value DESC NULLS LAST)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_offers_last_seen
  ON card_offers(last_seen_at)
  WHERE is_active = true;

-- Migration 021: Add source_name column to card_offers
-- Idempotent — safe to re-run.
ALTER TABLE card_offers ADD COLUMN IF NOT EXISTS source_name TEXT;

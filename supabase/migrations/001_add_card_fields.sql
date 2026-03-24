-- Migration 001: Add frontend display fields to credit_cards
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → paste → Run

ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS pros             TEXT[],
  ADD COLUMN IF NOT EXISTS cons             TEXT[],
  ADD COLUMN IF NOT EXISTS best_for         TEXT[],
  ADD COLUMN IF NOT EXISTS min_income       INTEGER,
  ADD COLUMN IF NOT EXISTS card_color       TEXT,
  ADD COLUMN IF NOT EXISTS card_network     TEXT;

-- Optional: index best_for for filtering ("show cards best for travelers")
CREATE INDEX IF NOT EXISTS idx_cards_best_for ON credit_cards USING GIN(best_for);

-- Migration 002: Add unique constraint required by the scraper's onConflict upsert
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → paste → Run

-- The scraper upserts with onConflict: 'card_id,offer_type,headline'
-- Postgres requires an actual UNIQUE constraint (or unique index) for ON CONFLICT to work.
-- Without this, every upsert fails silently and no rows are saved.

ALTER TABLE card_offers
  ADD CONSTRAINT card_offers_card_offer_headline_key
  UNIQUE (card_id, offer_type, headline);

-- Also add the public SELECT policy if it wasn't applied with the initial schema
-- (idempotent — will error harmlessly if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'card_offers' AND policyname = 'Public read offers'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public read offers" ON card_offers FOR SELECT USING (is_active = true)
    $policy$;
  END IF;
END $$;

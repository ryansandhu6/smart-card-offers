-- Migration 024: Offer review queue
--
-- 1. Adds review_status column to card_offers.
--      'approved'       — visible in public API (all existing rows get this)
--      'pending_review' — newly scraped/changed; hidden until admin approves
--      'rejected'       — trashed by admin; permanently inactive
--    Default 'approved' preserves all currently active offers with no disruption.
--
-- 2. Deactivates and rejects the 21 "(merged)" headline artifacts created
--    by migration 020 — these have meaningless aggregated values and look
--    bad in any UI.
--
-- 3. Adds a partial index for efficient pending queue queries.
--
-- Apply in Supabase SQL editor.
-- After applying: deploy code changes so scrapers route new/changed offers
-- through pending_review before they become visible in the public API.

ALTER TABLE card_offers
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved';

-- Clean up merged artifacts
UPDATE card_offers
SET    is_active     = false,
       review_status = 'rejected'
WHERE  headline ILIKE '%(merged)%'
  AND  is_active = true;

-- Efficient lookup for the admin review queue
CREATE INDEX IF NOT EXISTS idx_card_offers_review_status
  ON card_offers (review_status)
  WHERE review_status = 'pending_review';

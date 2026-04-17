-- One-time recovery: promote the 28 pending_review offers that were displaced
-- when the scraper overwrote active rows in-place (bug fixed in scraper-base.ts).
-- These cards currently have no active offer; promoting these pending rows
-- restores them to live immediately.
--
-- Safe to re-run: the WHERE clause is idempotent (only touches pending_review rows
-- that have no active sibling of the same type on the same card).

UPDATE public.card_offers
SET
  is_active     = true,
  review_status = 'approved'
WHERE
  review_status = 'pending_review'
  AND NOT EXISTS (
    SELECT 1
    FROM public.card_offers co2
    WHERE co2.card_id   = card_offers.card_id
      AND co2.offer_type = card_offers.offer_type
      AND co2.is_active  = true
      AND co2.id        != card_offers.id
  );

-- Migration 027: Merge active duplicate cards, fix scraper artifact slugs
--
-- Problems addressed:
--   1. scotia-amex-platinum    — duplicate of scotia-platinum-amex (both active)
--   2. amex-business-platinum  — duplicate of amex-biz-platinum (both active)
--   3. amex-green              — duplicate of american-express-green-card (both active)
--   4. sponsoredbmo-eclipse-*  — scraper artifact (Cheerio picked up "Sponsored" label)
--
-- Strategy: reassign offers to the keep slug, deactivate the drop slug.
-- All UPDATEs are slug-based and idempotent (safe to re-run on a fresh DB).

-- ── 1. Scotia Platinum Amex ───────────────────────────────────────────────────
-- Keep: scotia-platinum-amex  |  Deactivate: scotia-amex-platinum

UPDATE card_offers
SET card_id = (SELECT id FROM credit_cards WHERE slug = 'scotia-platinum-amex')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'scotia-amex-platinum');

UPDATE credit_cards SET is_active = false WHERE slug = 'scotia-amex-platinum';

-- ── 2. Amex Business Platinum ─────────────────────────────────────────────────
-- Keep: amex-biz-platinum  |  Deactivate: amex-business-platinum

UPDATE card_offers
SET card_id = (SELECT id FROM credit_cards WHERE slug = 'amex-biz-platinum')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'amex-business-platinum');

UPDATE credit_cards SET is_active = false WHERE slug = 'amex-business-platinum';

-- ── 3. Amex Green Card ────────────────────────────────────────────────────────
-- Keep: american-express-green-card  |  Deactivate: amex-green

UPDATE card_offers
SET card_id = (SELECT id FROM credit_cards WHERE slug = 'american-express-green-card')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'amex-green');

UPDATE credit_cards SET is_active = false WHERE slug = 'amex-green';

-- ── 4. BMO eclipse sponsored slug artifact ────────────────────────────────────
-- Scraper artifact: Cheerio captured the "Sponsored" label as part of the card name,
-- producing slug 'sponsoredbmo-eclipse-visa-infinite-card'.
-- Rename to a clean artifact slug and deactivate.

UPDATE credit_cards
SET slug = 'bmo-eclipse-visa-infinite-artifact', is_active = false
WHERE slug ILIKE 'sponsored%bmo-eclipse%';

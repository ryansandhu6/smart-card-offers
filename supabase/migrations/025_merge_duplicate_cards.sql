-- Migration 025: Merge 9 duplicate card records
--
-- Each pair was the same product with different slugs (scraper stubs vs seeded rows).
-- Strategy per pair:
--   1. Reassign all offers from the "drop" card to the "keep" card,
--      skipping any (offer_type, headline) that already exists on the keep card.
--   2. Deactivate the duplicate "drop" card.
--
-- Already applied via TypeScript runner on 2026-03-31.
-- This file documents the changes for the migration log.
--
-- Pairs merged (keep ← drop):
--   american-express-aeroplan-card        ← amex-aeroplan-core              (1 moved)
--   american-express-aeroplan-reserve-card← amex-aeroplan-reserve           (1 moved)
--   cibc-aeroplan-visa-infinite           ← cibc-aeroplan-visa-infinite-card (4 moved)
--   cibc-aeroplan-visa-infinite-privilege ← cibc-aeroplan-visa-privilege     (1 moved)
--   td-aeroplan-visa-privilege            ← td-aeroplan-visa-infinite-privilege-card (6 moved, 1 conflict deactivated)
--   td-aeroplan-visa-platinum-card        ← td-aeroplan-platinum             (1 moved)
--   scotiabank-scene-visa-card            ← scotiabank-scene-visa            (0 offers, card deactivated)
--   national-bank-world-elite             ← national-bank-world-elite-mastercard (1 moved)
--   td-cash-back-visa                     ← td-cash-back-visa-card           (2 moved)

-- Reassign offers (slug-based, idempotent — safe to re-run on a fresh DB)
UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'american-express-aeroplan-card')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'amex-aeroplan-core')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'american-express-aeroplan-card') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'american-express-aeroplan-reserve-card')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'amex-aeroplan-reserve')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'american-express-aeroplan-reserve-card') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aeroplan-visa-infinite')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aeroplan-visa-infinite-card')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aeroplan-visa-infinite') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aeroplan-visa-infinite-privilege')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aeroplan-visa-privilege')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aeroplan-visa-infinite-privilege') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'td-aeroplan-visa-privilege')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'td-aeroplan-visa-infinite-privilege-card')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'td-aeroplan-visa-privilege') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'td-aeroplan-visa-platinum-card')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'td-aeroplan-platinum')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'td-aeroplan-visa-platinum-card') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'scotiabank-scene-visa-card')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'scotiabank-scene-visa')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'scotiabank-scene-visa-card') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'national-bank-world-elite')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'national-bank-world-elite-mastercard')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'national-bank-world-elite') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

UPDATE card_offers SET card_id = (SELECT id FROM credit_cards WHERE slug = 'td-cash-back-visa')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'td-cash-back-visa-card')
  AND NOT EXISTS (SELECT 1 FROM card_offers x WHERE x.card_id = (SELECT id FROM credit_cards WHERE slug = 'td-cash-back-visa') AND x.offer_type = card_offers.offer_type AND x.headline = card_offers.headline);

-- Deactivate duplicate cards
UPDATE credit_cards SET is_active = false WHERE slug IN (
  'amex-aeroplan-core',
  'amex-aeroplan-reserve',
  'cibc-aeroplan-visa-infinite-card',
  'cibc-aeroplan-visa-privilege',
  'td-aeroplan-visa-infinite-privilege-card',
  'td-aeroplan-platinum',
  'scotiabank-scene-visa',
  'national-bank-world-elite-mastercard',
  'td-cash-back-visa-card'
);

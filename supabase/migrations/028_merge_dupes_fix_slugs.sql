-- Migration 028: Merge 4 more duplicate card pairs
--
-- Problems addressed:
--   1. cibc-aventura-visa-gold      — duplicate of cibc-aventura-gold-visa (both active)
--   2. rbc-avion-visa-platinum      — duplicate of rbc-visa-platinum-avion (both active)
--   3. td-fct-visa-platinum         — duplicate of td-platinum-travel-visa-card (both active)
--   4. amex-gold-rewards            — duplicate of american-express-gold-rewards-card (both active)
--
-- Strategy: reassign offers to the keep slug, deactivate the drop slug.
-- amex-gold-rewards had 1 conflicting offer; delete it first before reassigning.
-- All UPDATEs are slug-based and idempotent (safe to re-run on a fresh DB).

-- ── 1. CIBC Aventura Gold Visa ────────────────────────────────────────────────
-- Keep: cibc-aventura-gold-visa  |  Deactivate: cibc-aventura-visa-gold

UPDATE card_offers
SET card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aventura-gold-visa')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'cibc-aventura-visa-gold');

UPDATE credit_cards SET is_active = false WHERE slug = 'cibc-aventura-visa-gold';

-- ── 2. RBC Visa Platinum Avion ────────────────────────────────────────────────
-- Keep: rbc-visa-platinum-avion  |  Deactivate: rbc-avion-visa-platinum

UPDATE card_offers
SET card_id = (SELECT id FROM credit_cards WHERE slug = 'rbc-visa-platinum-avion')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'rbc-avion-visa-platinum');

UPDATE credit_cards SET is_active = false WHERE slug = 'rbc-avion-visa-platinum';

-- ── 3. TD Platinum Travel Visa ────────────────────────────────────────────────
-- Keep: td-platinum-travel-visa-card  |  Deactivate: td-fct-visa-platinum

UPDATE card_offers
SET card_id = (SELECT id FROM credit_cards WHERE slug = 'td-platinum-travel-visa-card')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'td-fct-visa-platinum');

UPDATE credit_cards SET is_active = false WHERE slug = 'td-fct-visa-platinum';

-- ── 4. Amex Gold Rewards Card ─────────────────────────────────────────────────
-- Keep: american-express-gold-rewards-card  |  Deactivate: amex-gold-rewards
-- Delete conflicting offer on drop card before reassigning the rest.

DELETE FROM card_offers
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'amex-gold-rewards')
  AND (offer_type, headline) IN (
    SELECT offer_type, headline FROM card_offers
    WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'american-express-gold-rewards-card')
  );

UPDATE card_offers
SET card_id = (SELECT id FROM credit_cards WHERE slug = 'american-express-gold-rewards-card')
WHERE card_id = (SELECT id FROM credit_cards WHERE slug = 'amex-gold-rewards');

UPDATE credit_cards SET is_active = false WHERE slug = 'amex-gold-rewards';

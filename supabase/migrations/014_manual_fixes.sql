-- migration 014: manual data fixes
-- Applied via TypeScript (npx tsx --env-file=.env.local) because the
-- project has no Supabase CLI / direct DB connection string.
-- This file documents the equivalent SQL for each step.

-- ── Step 1: Update apply_url ──────────────────────────────────────────────

UPDATE credit_cards SET apply_url = 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-viporter-world-elite-mastercard/'
  WHERE slug = 'bmo-viporter-world-elite-mastercard';

UPDATE credit_cards SET apply_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aeroplan-visa-infinite-card.html'
  WHERE slug IN ('cibc-aeroplan-visa-infinite', 'cibc-aeroplan-visa-infinite-card');

UPDATE credit_cards SET apply_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aeroplan-visa-infinite-privilege-card.html'
  WHERE slug = 'cibc-aeroplan-visa-infinite-privilege';

UPDATE credit_cards SET apply_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aventura-gold-visa-card.html'
  WHERE slug = 'cibc-aventura-gold-visa';

UPDATE credit_cards SET apply_url = 'https://www.rbcroyalbank.com/credit-cards/travel/rbc-visa-platinum-avion.html'
  WHERE slug = 'rbc-avion-visa-platinum';

UPDATE credit_cards SET apply_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/american-express/platinum-card.html'
  WHERE slug = 'scotiabank-american-express-platinum-card';

UPDATE credit_cards SET apply_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/momentum-infinite-card.html'
  WHERE slug IN ('scotia-momentum-visa-infinite-card', 'scotiabank-momentum-visa-infinite');

UPDATE credit_cards SET apply_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/passport-infinite-card.html'
  WHERE slug IN ('scotiabank-passport-visa-infinite-card', 'scotiabank-passport-visa-infinite');

UPDATE credit_cards SET apply_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-privilege-card'
  WHERE slug = 'td-aeroplan-visa-infinite-privilege-card';

UPDATE credit_cards SET apply_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/travel-rewards/platinum-travel-visa-card'
  WHERE slug = 'td-fct-visa-platinum';

UPDATE credit_cards SET apply_url = 'https://www.rbcroyalbank.com/credit-cards/travel/westjet-rbc-world-elite-mastercard.html'
  WHERE slug IN ('rbc-westjet-we', 'westjet-rbc-world-elite');

-- ── Step 2: Rename TD First Class Travel Visa Platinum Card ──────────────

UPDATE credit_cards SET name = 'TD Platinum Travel Visa* Card'
  WHERE slug = 'td-fct-visa-platinum';

-- ── Step 3: Deactivate discontinued/low-value cards ──────────────────────

UPDATE credit_cards SET is_active = false
  WHERE name ILIKE '%Air Miles%';

UPDATE credit_cards SET is_active = false
  WHERE name ILIKE '%RBC Cash Back Mastercard%'
     OR name ILIKE '%RBC Cash Back Preferred%';

-- ── Step 4: Insert welcome bonus offer for MBNA Rewards World Elite ───────

INSERT INTO card_offers (
  card_id, offer_type, headline, details,
  points_value, source_url, source_priority,
  scraped_at, last_seen_at, is_active
)
SELECT
  id,
  'welcome_bonus',
  '30,000 MBNA Rewards Points',
  'Earn up to 30,000 bonus MBNA Rewards Points for cash back, gift cards and more. Conditions apply.',
  30000,
  'https://www.mbna.ca/en/credit-cards/rewards/mbna-rewards-world-elite-mastercard',
  3,  -- bank-direct
  now(),
  now(),
  true
FROM credit_cards
WHERE slug = 'mbna-rewards-we-mc'
ON CONFLICT (card_id, offer_type, headline) DO UPDATE
  SET details       = EXCLUDED.details,
      points_value  = EXCLUDED.points_value,
      source_url    = EXCLUDED.source_url,
      last_seen_at  = EXCLUDED.last_seen_at,
      is_active     = EXCLUDED.is_active,
      updated_at    = now();

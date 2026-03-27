-- migration 016: populate rewards_program on all active cards where it is NULL
--
-- Mapping rules (priority order — specific beats generic):
--   Aeroplan cards              → Aeroplan
--   Avion / RBC ION / Avion     → RBC Avion
--   WestJet                     → WestJet Rewards
--   CIBC Aventura               → Aventura
--   TD Rewards / Platinum Travel→ TD Rewards
--   TD Aeroplan                 → Aeroplan
--   TD Cash Back / Low Rate     → Cash Back
--   Scotiabank (exc. Value)     → Scene+
--   Scotiabank Value Visa       → Cash Back
--   BMO Rewards / VIPorter      → BMO Rewards
--   BMO eclipse                 → BMO Rewards
--   BMO CashBack / Preferred    → Cash Back
--   Amex (exc. Aeroplan/Bonvoy) → American Express Rewards
--   Amex SimplyCash             → American Express Rewards
--   Marriott Bonvoy Amex        → Marriott Bonvoy
--   MBNA Rewards WE             → MBNA Rewards
--   MBNA True Line              → Cash Back
--   PC Financial                → PC Optimum
--   Tangerine                   → Tangerine Cash Back
--   Simplii                     → Simplii Cash Back
--   CIBC Dividend               → CIBC Dividend
--   CIBC Aventura               → Aventura
--   CIBC Aeroplan               → Aeroplan
--   CIBC Adapta                 → CIBC Rewards
--   National Bank               → À la carte Rewards
--   Neo                         → Neo Rewards
--   Cathay (powered by Neo)     → Asia Miles
--   RBC British Airways         → Avios
--   RBC Visa Platinum (non-Avion)→ RBC Rewards
--   RBC Visa Classic Low Rate   → Cash Back
--   More Rewards RBC            → More Rewards
--   Rogers                      → Rogers Rewards
--   Canadian Tire Triangle      → Canadian Tire Triangle Rewards

-- ── Aeroplan ──────────────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Aeroplan'
WHERE is_active = true AND rewards_program IS NULL
  AND (name ILIKE '%Aeroplan%');

-- ── RBC Avion ─────────────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'RBC Avion'
WHERE is_active = true AND rewards_program IS NULL
  AND (name ILIKE '%Avion%' OR name ILIKE '%RBC ION%');

-- ── WestJet Rewards ───────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'WestJet Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%WestJet%';

-- ── CIBC Aventura ─────────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Aventura'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%Aventura%';

-- ── TD Rewards (Travel / Platinum / Rewards Visa) ─────────────────────────
UPDATE credit_cards SET rewards_program = 'TD Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'td')
  AND (name ILIKE '%Rewards%' OR name ILIKE '%Platinum Travel%' OR name ILIKE '%First Class Travel%');

-- ── TD Cash Back and Low Rate → Cash Back ─────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'td')
  AND (name ILIKE '%Cash Back%' OR name ILIKE '%Low Rate%');

-- ── Scotiabank — Scene+ (all except Value Visa) ───────────────────────────
UPDATE credit_cards SET rewards_program = 'Scene+'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'scotiabank')
  AND name NOT ILIKE '%Value Visa%';

-- ── Scotiabank Value Visa — Cash Back ─────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'scotiabank')
  AND name ILIKE '%Value Visa%';

-- ── BMO Rewards (eclipse, Ascend, VIPorter) ───────────────────────────────
UPDATE credit_cards SET rewards_program = 'BMO Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'bmo')
  AND (name ILIKE '%eclipse%' OR name ILIKE '%Ascend%' OR name ILIKE '%VIPorter%');

-- ── BMO CashBack and Preferred Rate → Cash Back ───────────────────────────
UPDATE credit_cards SET rewards_program = 'Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'bmo')
  AND (name ILIKE '%CashBack%' OR name ILIKE '%Preferred Rate%');

-- ── Marriott Bonvoy (Amex co-brand — must come before generic Amex) ───────
UPDATE credit_cards SET rewards_program = 'Marriott Bonvoy'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%Marriott Bonvoy%';

-- ── American Express Rewards (remaining Amex + SimplyCash) ────────────────
UPDATE credit_cards SET rewards_program = 'American Express Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'amex');

-- ── MBNA Rewards World Elite ──────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'MBNA Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%MBNA Rewards%';

-- ── MBNA True Line → Cash Back ────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%MBNA%';

-- ── PC Optimum ────────────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'PC Optimum'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'pc-financial');

-- ── Tangerine Cash Back ───────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Tangerine Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'tangerine');

-- ── Simplii Cash Back ─────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Simplii Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'simplii');

-- ── CIBC Dividend ─────────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'CIBC Dividend'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%Dividend%';

-- ── CIBC Adapta (remaining CIBC card after Aeroplan/Aventura/Dividend) ────
UPDATE credit_cards SET rewards_program = 'CIBC Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'cibc');

-- ── National Bank → À la carte Rewards ───────────────────────────────────
UPDATE credit_cards SET rewards_program = 'À la carte Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'national-bank');

-- ── Cathay (Asia Miles, powered by Neo — specific before generic Neo) ──────
UPDATE credit_cards SET rewards_program = 'Asia Miles'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%Cathay%';

-- ── Neo Rewards ───────────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Neo Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'neo-financial');

-- ── RBC British Airways → Avios ───────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Avios'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%British Airways%';

-- ── More Rewards RBC ──────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'More Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%More Rewards%';

-- ── Rogers Rewards ────────────────────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Rogers Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'rogers-bank');

-- ── Canadian Tire Triangle Rewards ────────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Canadian Tire Triangle Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'canadian-tire');

-- ── RBC Visa Classic Low Rate → Cash Back ─────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND name ILIKE '%RBC Visa Classic%';

-- ── RBC Visa Platinum (non-Avion) → RBC Rewards ───────────────────────────
UPDATE credit_cards SET rewards_program = 'RBC Rewards'
WHERE is_active = true AND rewards_program IS NULL
  AND issuer_id = (SELECT id FROM issuers WHERE slug = 'rbc');

-- ── Fallback: remaining cashback cards ────────────────────────────────────
UPDATE credit_cards SET rewards_program = 'Cash Back'
WHERE is_active = true AND rewards_program IS NULL
  AND rewards_type = 'cashback';

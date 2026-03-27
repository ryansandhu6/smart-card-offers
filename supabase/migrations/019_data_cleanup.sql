-- Migration 019: Comprehensive data cleanup
-- Applied: 2026-03-27
-- Covers 8 remediation steps identified by the post-018 audit.
--
-- Pre-migration state (verified 2026-03-27):
--   active cards  : 78
--   active offers : 203
--   issuers       : 20
--
-- Steps:
--   1. Deactivate $undefined / null-value offers           (~16 rows)
--   2. Fix CIBC outlier points_value (25002500 → 25000)   (2 rows)
--   3. Deactivate remaining duplicate active offers        (1 row)
--   4. Fix rewards_type = 'cashback' for misclassified cards (11 rows)
--   5. Fix SimplyCash rewards_program                      (1 row)
--   6. Strip 'Sponsored' prefix from card names            (2 rows)
--      → migrate their orphaned active offers to canonical cards
--   7. Fix WestJet RBC duplicate card                      (1 card deactivated)
--   8. Reactivate Laurentian Bank / Meridian cards         (2 cards)
--      Note: issuer_ids are already correct; cards were wrongly inactive.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Deactivate offers with '$undefined' headline or no monetary value
-- ─────────────────────────────────────────────────────────────────────────────
-- Reason: these are scraper template-literal failures. An offer with no
-- points_value and no cashback_value is not surfaceable to users. The scraper
-- re-creates these on each run so we use pattern matching rather than hard-coded IDs.

UPDATE card_offers
SET    is_active = false, updated_at = now()
WHERE  is_active = true
  AND  (
         headline LIKE '%$undefined%'
         OR (points_value IS NULL AND cashback_value IS NULL)
       );

-- Verification: no active offer may have a null/undefined headline value
SELECT
  COUNT(*) FILTER (WHERE headline LIKE '%$undefined%')              AS remaining_undefined_headline,
  COUNT(*) FILTER (WHERE points_value IS NULL AND cashback_value IS NULL) AS remaining_null_value
FROM card_offers
WHERE is_active = true;
-- Expected: 0, 0


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Fix CIBC outlier points_value (25,002,500 → 25,000)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cause: scraper likely concatenated two string fragments ("25000" + "2500")
-- before parseInt, producing 25,002,500 instead of the actual 25,000 pt bonus.
-- Cards: CIBC Aventura® Visa Infinite* Card, CIBC Dividend Visa Infinite.

UPDATE card_offers
SET    points_value = 25000, updated_at = now()
WHERE  id IN (
  '7cf01a7c-304f-4a08-ab6d-c88106efdccd',  -- CIBC Aventura® Visa Infinite* Card
  '3ea42c14-3f7d-459f-b3e3-9dffcc377c0a'   -- CIBC Dividend Visa Infinite
);

-- Verification
SELECT id, points_value
FROM   card_offers
WHERE  id IN (
  '7cf01a7c-304f-4a08-ab6d-c88106efdccd',
  '3ea42c14-3f7d-459f-b3e3-9dffcc377c0a'
);
-- Expected: both rows with points_value = 25000


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Deactivate remaining duplicate active offers
-- ─────────────────────────────────────────────────────────────────────────────
-- After step 1, the null-value dupes are already inactive. One points-value dupe
-- remains: two rows share (card_id=febe4de7, points_value=15000, cashback=null,
-- priority=2) on American Express® Gold Rewards Card. Keep the older row
-- (0739816d, created first), deactivate the newer duplicate (317c7014).
--
-- Note: migration 015 already set points_value = 15000 on both rows; the dupe
-- was not created by 015 — it was a pre-existing double scrape.

UPDATE card_offers
SET    is_active = false, updated_at = now()
WHERE  id = '317c7014-0afa-4b47-8912-943d092cdbb5';  -- dupe of 0739816d-f21b-434c-862f-27bda4bc2629

-- General guard: deactivate any remaining dupes by (card_id, points_value,
-- cashback_value, source_priority), keeping the oldest row per group.
-- Uses a CTE to avoid re-scanning the table multiple times.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY card_id, points_value, cashback_value, source_priority
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM   card_offers
  WHERE  is_active = true
    AND  points_value IS NOT NULL          -- null-value dupes handled in step 1
),
dupes AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE card_offers
SET    is_active = false, updated_at = now()
FROM   dupes
WHERE  card_offers.id = dupes.id;

-- Verification: no active offer group should have count > 1
SELECT COUNT(*) AS remaining_dupes
FROM (
  SELECT card_id, points_value, cashback_value, source_priority
  FROM   card_offers
  WHERE  is_active = true
  GROUP  BY card_id, points_value, cashback_value, source_priority
  HAVING COUNT(*) > 1
) x;
-- Expected: 0


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Fix rewards_type for cashback cards stored as 'points'
-- ─────────────────────────────────────────────────────────────────────────────
-- Audit found 11 cards where rewards_program contains "cash back" / "simplii cash back"
-- but rewards_type = 'points'. This breaks frontend filtering.
-- Cards include (active and inactive): MBNA True Line Gold, TD Cash Back Visa*,
-- BMO CashBack Mastercard, BMO Preferred Rate, BMO CashBack WE MC,
-- Simplii Financial Cash Back Visa, Scotiabank Value Visa, RBC Visa Classic Low Rate,
-- TD Low Rate Visa, TD Cash Back Visa Infinite.

UPDATE credit_cards
SET    rewards_type = 'cashback', updated_at = now()
WHERE  rewards_type = 'points'
  AND  rewards_program ILIKE '%cash back%';

-- Verification
SELECT COUNT(*) AS still_wrong
FROM   credit_cards
WHERE  rewards_type = 'points'
  AND  rewards_program ILIKE '%cash back%';
-- Expected: 0


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Fix SimplyCash Preferred rewards_program
-- ─────────────────────────────────────────────────────────────────────────────
-- The SimplyCash™ Preferred Card (id: 754f48a5) has rewards_type='cashback' but
-- rewards_program='American Express Rewards' (the points program). Fix to 'SimplyCash'.

UPDATE credit_cards
SET    rewards_program = 'SimplyCash', updated_at = now()
WHERE  id = '754f48a5-ed5d-40ce-af3f-15e0f69436e9';

-- Verification
SELECT name, rewards_type, rewards_program
FROM   credit_cards
WHERE  id = '754f48a5-ed5d-40ce-af3f-15e0f69436e9';
-- Expected: rewards_program = 'SimplyCash'


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Strip 'Sponsored' prefix from card names
-- ─────────────────────────────────────────────────────────────────────────────
-- Two cards were seeded with the aggregator's "Sponsored" label in the name.
-- Both are already inactive (canonical active cards exist for each).
-- Cards:
--   19610d76  SponsoredBMO eclipse Visa Infinite* Card  → BMO eclipse Visa Infinite* Card
--   e07ac252  SponsoredTD First Class Travel® Visa Infinite* Card → TD First Class Travel® Visa Infinite* Card
--
-- Their active offers are orphaned on inactive card rows. Migrate them to the
-- canonical active card rows before deactivating the orphaned offers.
--
-- Canonical counterparts:
--   244051c8  BMO Eclipse Visa Infinite       (active)
--   c91db579  TD First Class Travel Visa Infinite Card  (active)

-- 6a. Migrate BMO eclipse Sponsored offers → BMO Eclipse Visa Infinite (244051c8)
--     Unique constraint: (card_id, offer_type, headline). These headlines do not
--     exist on 244051c8 so no conflict.
UPDATE card_offers
SET    card_id = '244051c8-a491-4c6e-9664-d8d727d4c046', updated_at = now()
WHERE  card_id = '19610d76-ffbc-4685-bbe8-59ca824cdca4'
  AND  is_active = true;

-- 6b. Migrate TD First Class Sponsored offer → TD First Class Travel Visa Infinite Card (c91db579)
UPDATE card_offers
SET    card_id = 'c91db579-9225-46a9-a2fe-f7d5839cb9b8', updated_at = now()
WHERE  card_id = 'e07ac252-e551-4b2a-80d9-e4124caabdb8'
  AND  is_active = true;

-- 6c. Strip the 'Sponsored' prefix from names (also fixes slugs via slug column if needed)
UPDATE credit_cards
SET    name = REGEXP_REPLACE(name, '^Sponsored', ''), updated_at = now()
WHERE  name LIKE 'Sponsored%';

-- Verification: no card names should start with 'Sponsored'
SELECT COUNT(*) AS still_sponsored
FROM   credit_cards
WHERE  name LIKE 'Sponsored%';
-- Expected: 0

-- Verify offers migrated successfully
SELECT COUNT(*) AS bmo_eclipse_active_offers
FROM   card_offers
WHERE  card_id = '244051c8-a491-4c6e-9664-d8d727d4c046'
  AND  is_active = true;
-- Expected: 4 (1 pre-existing + 3 migrated from Sponsored card)

SELECT COUNT(*) AS td_first_class_active_offers
FROM   card_offers
WHERE  card_id = 'c91db579-9225-46a9-a2fe-f7d5839cb9b8'
  AND  is_active = true;
-- Expected: 2 (1 pre-existing + 1 migrated from Sponsored card)


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Fix WestJet RBC duplicate card
-- ─────────────────────────────────────────────────────────────────────────────
-- Two "WestJet RBC World Elite Mastercard" rows were created from different scraper runs:
--   3a953c8f  slug: westjet-rbc-world-elite  created: 2026-03-24T03:31  ← ORIGINAL (keep)
--   d2e235ef  slug: rbc-westjet-we           created: 2026-03-24T17:49  ← DUPLICATE (deactivate)
--
-- The duplicate holds the best active offer: "60,000 pts WJ after $5,000 spend"
-- (id: 57f0ea70, 60,000 pts, source_priority=1). Move it to the original card.
--
-- The original has offer 0bc5e087 "Up to 45,000 WestJet points" with points_value=450
-- (CPP-inflation bug: 45,000 × 0.01 = 450 stored instead of raw points count).
-- Fix that while we're here.

-- 7a. Move the good offer from the duplicate to the original card
UPDATE card_offers
SET    card_id = '3a953c8f-16e6-49d2-9cb4-61cc99838db2', updated_at = now()
WHERE  id = '57f0ea70-9e43-4433-bf00-ee5c227eabaf';  -- "60,000 pts WJ after $5,000 spend"

-- 7b. Fix the CPP-inflated points_value on the original card's existing offer
UPDATE card_offers
SET    points_value = 45000, updated_at = now()
WHERE  id = '0bc5e087-c722-49c1-ad3a-cbda1e03b3dd';  -- "Up to 45,000 WestJet points" was 450

-- 7c. Deactivate the duplicate card (it now has no active offers)
UPDATE credit_cards
SET    is_active = false, updated_at = now()
WHERE  id = 'd2e235ef-686b-4cdb-aa2b-95480283a7ea';  -- WestJet RBC WE duplicate (slug: rbc-westjet-we)

-- Verification
SELECT
  c.name,
  c.slug,
  c.is_active,
  COUNT(o.id) FILTER (WHERE o.is_active) AS active_offers
FROM  credit_cards c
LEFT JOIN card_offers o ON o.card_id = c.id
WHERE c.name ILIKE '%westjet%rbc%'
   OR c.name ILIKE '%westjet%mastercard%'
GROUP BY c.id, c.name, c.slug, c.is_active
ORDER BY c.created_at;
-- Expected:
--   WestJet RBC Mastercard          | westjet-rbc-mastercard     | true  | (existing)
--   WestJet RBC World Elite MC      | westjet-rbc-world-elite    | true  | ≥2 active offers
--   WestJet RBC World Elite MC      | rbc-westjet-we             | false | 0 active offers


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: Reactivate Laurentian Bank and Meridian cards
-- ─────────────────────────────────────────────────────────────────────────────
-- Both cards have correct issuer_ids (verified 2026-03-27):
--   Laurentian Bank Visa Infinite Card  → issuer: b78675b5 (Laurentian Bank) ✓
--   Meridian Visa Infinite* Travel Rewards Card → issuer: b1503feb (Meridian) ✓
--
-- Both have active offers (12,000 and 7,000 pts respectively, set in migration 015).
-- They were deactivated prior to migration 018 but not by 018 — no documented reason.
-- Reactivating so they appear under the correct issuer in the catalogue.

UPDATE credit_cards
SET    is_active = true, updated_at = now()
WHERE  id IN (
  '8a6c364c-a2d6-4dfa-ae67-e65bec8d1981',  -- Laurentian Bank Visa Infinite Card
  '6c9d047c-24df-44eb-baca-893e1edbc0df'   -- Meridian Visa Infinite* Travel Rewards Card
);

-- Verification
SELECT c.name, c.is_active, i.name AS issuer, COUNT(o.id) FILTER (WHERE o.is_active) AS active_offers
FROM   credit_cards c
JOIN   issuers i ON i.id = c.issuer_id
LEFT JOIN card_offers o ON o.card_id = c.id
WHERE  c.id IN (
  '8a6c364c-a2d6-4dfa-ae67-e65bec8d1981',
  '6c9d047c-24df-44eb-baca-893e1edbc0df'
)
GROUP BY c.id, c.name, c.is_active, i.name;
-- Expected: both is_active=true, correct issuer names, active_offers ≥ 1


-- ─────────────────────────────────────────────────────────────────────────────
-- FINAL VERIFICATION: Post-migration state summary
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM credit_cards WHERE is_active = true)                         AS active_cards,
  (SELECT COUNT(*) FROM card_offers  WHERE is_active = true)                         AS active_offers,
  (SELECT COUNT(*) FROM card_offers  WHERE is_active = true AND headline LIKE '%$undefined%') AS undefined_offers,
  (SELECT COUNT(*) FROM card_offers  WHERE is_active = true AND points_value IS NULL AND cashback_value IS NULL) AS null_value_offers,
  (SELECT COUNT(*) FROM card_offers  WHERE points_value = 25002500)                  AS cibc_outlier_offers,
  (SELECT COUNT(*) FROM credit_cards WHERE rewards_type = 'points' AND rewards_program ILIKE '%cash back%') AS wrong_rewards_type,
  (SELECT COUNT(*) FROM credit_cards WHERE name LIKE 'Sponsored%')                   AS sponsored_names;
-- Expected: undefined_offers=0, null_value_offers=0, cibc_outlier_offers=0,
--           wrong_rewards_type=0, sponsored_names=0
-- active_cards should be ~80 (+2 for Laurentian/Meridian, -1 for WestJet dupe)
-- active_offers will decrease by ~17 (deactivations) and the net may vary slightly
--   based on whether the scraper has run since the pre-migration baseline.

-- Migration 018: Deactivate active cards that have zero active offers
-- These cards have no welcome bonus data and should not be surfaced to users.
-- Cards deactivated (15):
--   Canadian Tire Triangle World Elite Mastercard
--   MBNA True Line Mastercard
--   National Bank® World Elite® Mastercard®
--   Neo World Elite® Mastercard
--   Neo World Mastercard®
--   RBC Visa Classic Low Rate
--   RBC Visa Platinum
--   Rogers Red Mastercard
--   Rogers Red World Elite Mastercard
--   Scotia Momentum® Visa Infinite* Card
--   Scotiabank Momentum Mastercard
--   Scotiabank Momentum Visa
--   Scotiabank Value Visa Card
--   TD Cash Back Visa Card
--   TD Low Rate Visa Card

UPDATE credit_cards
SET is_active = false, updated_at = now()
WHERE id IN (
  '3e484f49-16b5-4404-ab84-c56be1bdea85',  -- Canadian Tire Triangle World Elite Mastercard
  'b956ed2f-dcad-4d75-a197-ca59b7f6413a',  -- MBNA True Line Mastercard
  '77e32b52-4a7d-4aa6-bbde-2e99f1bcdfbb',  -- National Bank® World Elite® Mastercard®
  '440446f0-4189-49fd-ad12-330362ec02ba',  -- Neo World Elite® Mastercard
  '9055bcb4-a1a2-4f5a-9455-03d03638d525',  -- Neo World Mastercard®
  'be26e9c1-ee30-48d5-bbd5-9b4591ca58c9',  -- RBC Visa Classic Low Rate
  '68989ad3-9bed-41e3-8feb-f1a4797bfeeb',  -- RBC Visa Platinum
  'ecaf6133-99bc-4b5d-9708-951cf292381e',  -- Rogers Red Mastercard
  'c0815f02-b6f8-4850-a754-8d4b1db34879',  -- Rogers Red World Elite Mastercard
  '0e23e16b-3ad5-4438-97bf-a99a11ee5713',  -- Scotia Momentum® Visa Infinite* Card
  '6da2400a-a4c8-4a98-9759-ce7448f85dd3',  -- Scotiabank Momentum Mastercard
  '23906640-a655-409c-8db1-71fd8eb44541',  -- Scotiabank Momentum Visa
  'b3f55d52-a386-447b-a90d-5f5e9c3ae5ec',  -- Scotiabank Value Visa Card
  '623ba9dd-c613-445c-90db-b2903aea6169',  -- TD Cash Back Visa Card
  'a3511edf-e62a-48dc-858c-6646a26b9d83'   -- TD Low Rate Visa Card
);

-- Verification: must return 0
SELECT COUNT(*) AS remaining_active_no_offers
FROM credit_cards
WHERE is_active = true
  AND id NOT IN (
    SELECT DISTINCT card_id FROM card_offers WHERE is_active = true
  );

-- ============================================================
-- Migration 008: is_better_than_usual column on card_offers
-- ============================================================
-- Adds a boolean flag that is automatically set to TRUE when
-- the offer's points_value or cashback_value exceeds the
-- 90-day rolling average for that card/offer_type in offer_history.
--
-- Maintained by a BEFORE INSERT OR UPDATE trigger so the flag
-- is always current without requiring application-layer changes.
-- ============================================================

-- 1. Add the column
ALTER TABLE card_offers
  ADD COLUMN IF NOT EXISTS is_better_than_usual BOOLEAN NOT NULL DEFAULT false;

-- 2. Trigger function
--    Runs BEFORE each INSERT or UPDATE on card_offers.
--    Queries offer_history for the 90-day rolling average and
--    compares it against the incoming row's values.
--
--    NULL-safety: COALESCE(x > avg, false) returns false whenever
--    either side is NULL (no value on the offer, or no history yet).
CREATE OR REPLACE FUNCTION refresh_is_better_than_usual()
RETURNS TRIGGER AS $$
DECLARE
  v_avg_points   NUMERIC;
  v_avg_cashback NUMERIC;
BEGIN
  SELECT
    AVG(points_value),
    AVG(cashback_value)
  INTO v_avg_points, v_avg_cashback
  FROM offer_history
  WHERE card_id    = NEW.card_id
    AND offer_type = NEW.offer_type
    AND first_seen_at > now() - interval '90 days';

  NEW.is_better_than_usual :=
    COALESCE(NEW.points_value   > v_avg_points,   false)
    OR
    COALESCE(NEW.cashback_value > v_avg_cashback, false);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger — fires on every write, keeping the flag fresh
DROP TRIGGER IF EXISTS trg_card_offers_is_better_than_usual ON card_offers;
CREATE TRIGGER trg_card_offers_is_better_than_usual
  BEFORE INSERT OR UPDATE
  ON card_offers
  FOR EACH ROW
  EXECUTE FUNCTION refresh_is_better_than_usual();

-- 4. Backfill existing rows using the same 90-day logic
--    (correlated aggregate subquery — one scan per row, acceptable
--    since this only runs once at migration time)
UPDATE card_offers co
SET is_better_than_usual = COALESCE(
  (
    SELECT
      COALESCE(co.points_value   > AVG(oh.points_value),   false)
      OR
      COALESCE(co.cashback_value > AVG(oh.cashback_value), false)
    FROM offer_history oh
    WHERE oh.card_id    = co.card_id
      AND oh.offer_type = co.offer_type
      AND oh.first_seen_at > now() - interval '90 days'
  ),
  false
);

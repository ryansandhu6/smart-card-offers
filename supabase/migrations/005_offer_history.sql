-- ============================================================
-- Migration 005: offer_history table + offer_history_stats view
-- Run in Supabase SQL editor or via: supabase db push
-- ============================================================

CREATE TABLE offer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  offer_type TEXT NOT NULL,
  headline TEXT NOT NULL,
  points_value INTEGER,
  cashback_value NUMERIC(5,2),
  spend_requirement NUMERIC(10,2),
  spend_timeframe_days INTEGER,
  source_priority INTEGER,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups per card
CREATE INDEX idx_offer_history_card_id ON offer_history(card_id);
CREATE INDEX idx_offer_history_points_value ON offer_history(card_id, points_value DESC);

-- is_better_than_usual view:
-- An offer is "better than usual" if its points_value or cashback_value
-- is higher than the average for that card over the last 12 months
CREATE OR REPLACE VIEW offer_history_stats AS
SELECT
  card_id,
  offer_type,
  MAX(points_value) as all_time_high_points,
  ROUND(AVG(points_value)) as avg_points_12mo,
  MAX(cashback_value) as all_time_high_cashback,
  ROUND(AVG(cashback_value)::numeric, 2) as avg_cashback_12mo,
  COUNT(*) as total_offers_seen
FROM offer_history
WHERE first_seen_at > now() - interval '12 months'
GROUP BY card_id, offer_type;

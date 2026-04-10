-- Migration 040: card_earn_rates table
-- Stores per-card earn rate rows scraped from "Earning Rewards" / "Earn Rates" tables.
-- Sources: Prince of Travel (priority 1), MintFlying (priority 2).
-- Priority guard enforced in application: lower priority number (higher trust) wins.
-- Unique key: (card_id, category) — one row per spend category per card.

CREATE TABLE IF NOT EXISTS public.card_earn_rates (
  id              UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id         UUID           NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  category        TEXT           NOT NULL,
  rate            NUMERIC(6,2),
  rate_text       TEXT,
  source_priority INTEGER        NOT NULL DEFAULT 4,
  scraped_at      TIMESTAMPTZ    DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_earn_rates_card_category_uidx
  ON public.card_earn_rates (card_id, category);

ALTER TABLE public.card_earn_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read card_earn_rates"
  ON public.card_earn_rates FOR SELECT USING (true);

-- Migration 042: card_credits table
-- Stores per-card statement credits and recurring benefits scraped from MintFlying's
-- Travel Benefits section ($100 travel credit, $50 NEXUS credit, Instacart credits, etc.).
-- Unique key: (card_id, credit_type) — one row per credit type per card.

CREATE TABLE IF NOT EXISTS public.card_credits (
  id              UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id         UUID           NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  credit_type     TEXT           NOT NULL,
  amount          NUMERIC(10,2),
  description     TEXT,
  frequency       TEXT,          -- 'annual' | 'monthly' | 'once'
  source_priority INTEGER        NOT NULL DEFAULT 4,
  scraped_at      TIMESTAMPTZ    DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_credits_card_type_uidx
  ON public.card_credits (card_id, credit_type);

ALTER TABLE public.card_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read card_credits"
  ON public.card_credits FOR SELECT USING (true);

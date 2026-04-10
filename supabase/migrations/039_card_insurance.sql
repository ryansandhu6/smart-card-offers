-- Migration 039: card_insurance table
-- Stores per-card insurance coverage rows scraped from Prince of Travel's
-- "Insurance Coverage" table (COVERAGE / MAXIMUM / DETAILS columns).
-- Unique key: (card_id, coverage_type) — one row per coverage type per card.

CREATE TABLE IF NOT EXISTS public.card_insurance (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id         UUID        NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  coverage_type   TEXT        NOT NULL,
  maximum         TEXT,
  details         TEXT,
  source_priority INTEGER     NOT NULL DEFAULT 4,
  scraped_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_insurance_card_coverage_uidx
  ON public.card_insurance (card_id, coverage_type);

ALTER TABLE public.card_insurance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read card_insurance"
  ON public.card_insurance FOR SELECT USING (true);

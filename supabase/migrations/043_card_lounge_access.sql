-- Migration 043: card_lounge_access table
-- Stores per-card lounge access programs scraped from MintFlying's Lounge Access
-- callout box and Prince of Travel's benefits sections.
-- Unique key: (card_id, network) — one row per lounge network per card.

CREATE TABLE IF NOT EXISTS public.card_lounge_access (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id          UUID        NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  network          TEXT        NOT NULL,
  visits_per_year  INTEGER,    -- NULL = unlimited
  guest_policy     TEXT,
  details          TEXT,
  source_priority  INTEGER     NOT NULL DEFAULT 4,
  scraped_at       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_lounge_access_card_network_uidx
  ON public.card_lounge_access (card_id, network);

ALTER TABLE public.card_lounge_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read card_lounge_access"
  ON public.card_lounge_access FOR SELECT USING (true);

-- Migration 041: card_transfer_partners table
-- Stores per-card transfer partner rows scraped from "Transfer Partners" tables.
-- Sources: Prince of Travel (PARTNER / RATIO / TRANSFER TIME),
--          MintFlying (Partner / Transfer Ratio / Alliance / Best For).
-- Unique key: (card_id, partner_name) — one row per partner per card.

CREATE TABLE IF NOT EXISTS public.card_transfer_partners (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id         UUID        NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  partner_name    TEXT        NOT NULL,
  transfer_ratio  TEXT,
  transfer_time   TEXT,
  alliance        TEXT,
  best_for        TEXT,
  source_priority INTEGER     NOT NULL DEFAULT 4,
  scraped_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_transfer_partners_card_partner_uidx
  ON public.card_transfer_partners (card_id, partner_name);

ALTER TABLE public.card_transfer_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read card_transfer_partners"
  ON public.card_transfer_partners FOR SELECT USING (true);

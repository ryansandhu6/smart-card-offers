-- Migration 044: interest rate fields on credit_cards
-- Stores purchase, cash advance, and balance transfer APRs scraped from PoT's
-- Interest Rates section. Written null-guarded (only when DB value is NULL).

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS purchase_rate         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cash_advance_rate     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS balance_transfer_rate NUMERIC(5,2);

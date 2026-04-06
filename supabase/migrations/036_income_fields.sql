-- Migration 036: add minimum_household_income column to credit_cards
-- foreign_transaction_fee (NUMERIC(4,2)) and min_income (INTEGER) already exist.
-- This adds the household income threshold as a separate column.

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS minimum_household_income INTEGER;

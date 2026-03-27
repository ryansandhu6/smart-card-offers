-- Migration 006: Add insurance, travel benefit, income, and fee fields to credit_cards
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → paste → Run

ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS income_type              TEXT,               -- 'personal' | 'household' | 'business'
  ADD COLUMN IF NOT EXISTS supplementary_card_fee   NUMERIC(8,2),       -- Annual fee per additional cardholder
  ADD COLUMN IF NOT EXISTS mobile_wallet            TEXT[],             -- ['Apple Pay', 'Google Pay', 'Samsung Pay']
  ADD COLUMN IF NOT EXISTS extended_warranty        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_protection         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rental_car_insurance     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS airport_lounge_network   TEXT,               -- 'Priority Pass' | 'Amex Centurion' | 'Visa Airport Companion' | etc.
  ADD COLUMN IF NOT EXISTS signup_bonus_description TEXT;               -- Human-readable summary of the welcome bonus structure

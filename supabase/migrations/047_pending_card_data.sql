-- Migration 047: pending card data columns
-- Scrapers no longer overwrite live card fields on existing approved cards.
-- Instead, proposed changes are stored here for admin review.

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS pending_card_data  JSONB,
  ADD COLUMN IF NOT EXISTS has_pending_update BOOLEAN NOT NULL DEFAULT false;

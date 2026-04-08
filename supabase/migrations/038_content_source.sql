-- Migration 038: add content_source column to credit_cards and card_offers
-- Tracks the origin of short_description (credit_cards) and headline (card_offers):
--   'manual'       — admin wrote it; script will never overwrite
--   'ai_generated' — produced by ai-generate-content.ts; can be re-run / improved
--   'scraper'      — filled in by a scraper
--   NULL           — origin unknown (treated as eligible for AI generation)

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS content_source TEXT;

ALTER TABLE public.card_offers
  ADD COLUMN IF NOT EXISTS content_source TEXT;

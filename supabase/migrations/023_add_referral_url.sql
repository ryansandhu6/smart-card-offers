-- Migration 023: Ensure referral_url column exists on credit_cards
-- Idempotent — safe to re-run. Column was present in the original schema
-- for most deployments; this guards against any environment where it was missed.
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS referral_url TEXT;

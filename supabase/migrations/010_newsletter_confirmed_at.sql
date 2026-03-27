-- migration 010: add confirmed_at to newsletter_subscribers
-- Records the exact moment a subscriber clicked the confirmation link.
-- Distinct from subscribed_at (signup time) — both are needed for CASL audit trails.

ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

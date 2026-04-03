ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS has_no_bonus boolean NOT NULL DEFAULT false;

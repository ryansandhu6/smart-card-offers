ALTER TABLE public.card_offers ADD COLUMN IF NOT EXISTS is_monthly_bonus boolean NOT NULL DEFAULT false;
ALTER TABLE public.card_offers ADD COLUMN IF NOT EXISTS monthly_points_value integer;
ALTER TABLE public.card_offers ADD COLUMN IF NOT EXISTS monthly_spend_requirement numeric(10,2);
ALTER TABLE public.card_offers ADD COLUMN IF NOT EXISTS bonus_months integer;

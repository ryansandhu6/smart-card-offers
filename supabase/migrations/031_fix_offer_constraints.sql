ALTER TABLE public.card_offers DROP CONSTRAINT IF EXISTS card_offers_offer_type_check;
ALTER TABLE public.card_offers ADD CONSTRAINT card_offers_offer_type_check CHECK (offer_type IN ('welcome_bonus', 'additional_offer', 'referral'));
ALTER TABLE public.card_offers DROP CONSTRAINT IF EXISTS card_offers_card_offer_headline_key;
CREATE UNIQUE INDEX card_offers_welcome_unique ON public.card_offers (card_id) WHERE offer_type = 'welcome_bonus';

-- Migration 037: add review_reason to card_offers
-- Explains why an offer appeared in the review queue:
--   new_card             – no matching card existed; a stub was created
--   new_offer            – first time this offer_type was seen for this card
--   higher_bonus         – same offer_type, incoming value is higher than existing
--   updated_terms        – same offer_type & same priority, terms changed
--   lower_priority_source – incoming has a lower (more trusted) priority number

ALTER TABLE public.card_offers
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- Allow multiple active offers of the same type per card.
-- The application previously enforced one active welcome_bonus per card via
-- approveOffer(); that logic has been removed. Drop the DB-level unique index
-- that was added in 031 as a secondary guard.
DROP INDEX IF EXISTS public.card_offers_welcome_unique;

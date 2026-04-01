-- Migration 026: Final pre-launch data audit cleanup
--
-- Issues found and fixed (2026-03-31):
--   1. e9314bea — Amex Aeroplan Card: p4 (MintFlying) offer with null points+cashback, headline only
--   2. 2ed25c61 — Amex Aeroplan Reserve: p1 stale 60k offer (current churningcanada offer is 90k)
--   3. 89540edd — Amex Aeroplan Card: p1 stale 30k offer (current churningcanada offer is 40k)
--   4. c14bf281 — TD Aeroplan Visa Platinum: p1 "10k on first purchase" (superseded by 15k with spend)
--   5. c6d4cf19 — Marriott Bonvoy Amex: p2 CPP bug artifact — pts_value=2200 on 110k offer (pre-fix residue)
--   6. c0968d7f — SimplyCash Preferred: p2 cashback stored in points_value=200 instead of cashback_value
--
-- Result: 105 → 99 active offers, 0 pending_review, 0 junk

UPDATE card_offers
SET is_active = false, review_status = 'rejected'
WHERE id IN (
  'e9314bea-35ec-4739-b267-8ce116915e74',
  '2ed25c61-172c-4b9e-8515-bc649bf2337b',
  '89540edd-b13d-4693-a374-3ab54cfc417b',
  'c14bf281-b586-4dbe-bf8c-32523da6d8c7',
  'c6d4cf19-586c-4d7c-b03c-290365605657',
  'c0968d7f-d7e2-46d4-89ab-4d99c7623b5b'
)
AND is_active = true; -- idempotent guard

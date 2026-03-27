-- ============================================================
-- Migration 009: full-text search across cards, issuers, offers
-- ============================================================
-- Creates:
--   1. GIN indexes on credit_cards.name and card_offers.headline
--      for fast tsvector lookups.
--   2. search_card_ids(q, p_limit, p_offset) — PL/pgSQL function
--      that runs FTS across card name, issuer name, and active
--      offer headlines, returns ranked card IDs + total_count.
--
-- Called from the application via supabaseAdmin.rpc().
-- The caller is responsible for fetching full card data for the
-- returned IDs so the response shape stays identical to GET /api/cards.
-- ============================================================

-- 1. GIN indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_credit_cards_name_fts
  ON credit_cards USING GIN (to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_card_offers_headline_fts
  ON card_offers USING GIN (to_tsvector('english', headline));

-- 2. FTS function
--    Uses websearch_to_tsquery — handles bare user input safely
--    ("amex cobalt", "cash back", "td -aeroplan" all work).
--    Returns NULL rows for empty / unsearchable queries.
--
--    Ranking: ts_rank against the union of card name + issuer name
--    + all active offer headlines for that card (aggregated so each
--    card appears at most once, scored by its best-matching offer).
CREATE OR REPLACE FUNCTION search_card_ids(
  q        TEXT,
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (card_id UUID, rank REAL, total_count BIGINT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  tsq TSQUERY;
BEGIN
  -- websearch_to_tsquery returns NULL for empty / whitespace-only input
  tsq := websearch_to_tsquery('english', q);
  IF tsq IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matches AS (
    SELECT
      cc.id,
      -- Score against the concatenated document for this card.
      -- MAX() because one card may match via multiple offer headlines;
      -- we want the highest rank across all of them.
      MAX(
        ts_rank(
          to_tsvector('english',
            coalesce(cc.name,    '') || ' ' ||
            coalesce(i.name,     '') || ' ' ||
            coalesce(co.headline,'')
          ),
          tsq
        )
      ) AS rank
    FROM credit_cards cc
    LEFT JOIN issuers    i  ON i.id    = cc.issuer_id
    LEFT JOIN card_offers co ON co.card_id = cc.id
                            AND co.is_active = true
    WHERE
      cc.is_active = true
      AND (
           to_tsvector('english', coalesce(cc.name,     '')) @@ tsq
        OR to_tsvector('english', coalesce(i.name,      '')) @@ tsq
        OR to_tsvector('english', coalesce(co.headline, '')) @@ tsq
      )
    GROUP BY cc.id
  )
  SELECT
    id::UUID                AS card_id,
    rank::REAL,
    COUNT(*) OVER ()::BIGINT AS total_count
  FROM   matches
  ORDER  BY rank DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

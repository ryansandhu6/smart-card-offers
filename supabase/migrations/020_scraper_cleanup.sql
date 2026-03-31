-- Migration 020: Scraper output cleanup — priority pruning + duplicate-offer merging
-- Idempotent: safe to re-run (already-inactive rows are no-ops; merged rows use ON CONFLICT).
-- Run: psql "$DATABASE_URL" -f supabase/migrations/020_scraper_cleanup.sql
--   or via the Supabase SQL editor.

DO $$
DECLARE
  n           INTEGER;
  grp         RECORD;
  total_pts   BIGINT;
  total_cash  NUMERIC;
  merged_hdl  TEXT;
  merged_dtl  TEXT;
  max_spend   NUMERIC;
  max_days    INTEGER;
  src_url     TEXT;
  grp_count   INTEGER := 0;
BEGIN

  -- ══════════════════════════════════════════════════════════════════════
  -- STEP 1 — Deactivate all priority 3 and 4 (low-trust) offers
  -- ══════════════════════════════════════════════════════════════════════
  --   source_priority meaning:
  --     1 = bank-direct (highest trust)
  --     2 = aggregator / curated editorial
  --     3 = churningcanada community README
  --     4 = legacy hardcoded fallback
  --   p3/p4 is only useful as a last resort. After cleanup every active
  --   card should have ≥1 offer at p1 or p2.

  UPDATE card_offers
  SET    is_active = false, updated_at = now()
  WHERE  is_active = true
    AND  source_priority IN (3, 4);

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '[020] Step 1: deactivated % p3/p4 offer(s)', n;


  -- ══════════════════════════════════════════════════════════════════════
  -- STEP 2 — Merge duplicate (card_id, offer_type, source_priority) groups
  -- ══════════════════════════════════════════════════════════════════════
  --   When a scraper returns multiple rows for the same card + offer type
  --   at the same priority (e.g. milestone tiers of one welcome bonus),
  --   sum the values, concatenate the descriptions, deactivate the parts,
  --   and insert a single combined row.

  FOR grp IN
    SELECT card_id, offer_type, source_priority
    FROM   card_offers
    WHERE  is_active = true
    GROUP  BY card_id, offer_type, source_priority
    HAVING COUNT(*) > 1
    ORDER  BY source_priority, card_id, offer_type
  LOOP

    -- Aggregate all active parts in this group (highest-value part first)
    SELECT
      COALESCE(SUM(points_value),    0)::BIGINT,
      COALESCE(SUM(cashback_value),  0)::NUMERIC,
      STRING_AGG(
        headline,
        ' + '
        ORDER BY COALESCE(points_value, 0) + COALESCE(cashback_value, 0) DESC
      ),
      NULLIF(TRIM(STRING_AGG(
        COALESCE(NULLIF(details, ''), headline),
        ' '
        ORDER BY COALESCE(points_value, 0) + COALESCE(cashback_value, 0) DESC
      )), ''),
      MAX(spend_requirement),
      MAX(spend_timeframe_days),
      MAX(source_url)
    INTO total_pts, total_cash, merged_hdl, merged_dtl,
         max_spend, max_days, src_url
    FROM  card_offers
    WHERE card_id         = grp.card_id
      AND offer_type      = grp.offer_type
      AND source_priority = grp.source_priority
      AND is_active       = true;

    -- Deactivate individual parts
    UPDATE card_offers
    SET    is_active = false, updated_at = now()
    WHERE  card_id         = grp.card_id
      AND  offer_type      = grp.offer_type
      AND  source_priority = grp.source_priority
      AND  is_active       = true;

    GET DIAGNOSTICS n = ROW_COUNT;

    -- Insert merged row; ON CONFLICT keeps it idempotent
    INSERT INTO card_offers (
      card_id, offer_type, headline, details,
      points_value, cashback_value,
      spend_requirement, spend_timeframe_days,
      source_priority, is_active,
      scraped_at, last_seen_at, source_url
    ) VALUES (
      grp.card_id,
      grp.offer_type,
      'Up to ' || CASE
        WHEN total_pts > 0
          THEN to_char(total_pts, 'FM999,999,999') || ' points (merged)'
        ELSE
          total_cash::TEXT || ' cashback (merged)'
      END,
      merged_dtl,
      NULLIF(total_pts,  0),
      NULLIF(total_cash, 0),
      max_spend,
      max_days,
      grp.source_priority,
      true,
      now(), now(),
      src_url
    )
    ON CONFLICT (card_id, offer_type, headline)
      DO UPDATE SET is_active = true, updated_at = now();

    grp_count := grp_count + 1;
    RAISE NOTICE '[020] Step 2 [%]: merged % parts → card=% type=% p%  pts=% cash=%',
      grp_count, n,
      grp.card_id, grp.offer_type, grp.source_priority,
      total_pts, total_cash;

  END LOOP;

  RAISE NOTICE '[020] Step 2: merged % group(s) total', grp_count;


  -- ══════════════════════════════════════════════════════════════════════
  -- VERIFY
  -- ══════════════════════════════════════════════════════════════════════

  SELECT COUNT(*) INTO n
  FROM   card_offers
  WHERE  is_active = true AND source_priority IN (3, 4);
  RAISE NOTICE '[020] Verify — active p3/p4 offers: % (expect 0)', n;

  SELECT COUNT(*) INTO n
  FROM (
    SELECT card_id, offer_type, source_priority
    FROM   card_offers
    WHERE  is_active = true
    GROUP  BY card_id, offer_type, source_priority
    HAVING COUNT(*) > 1
  ) dup;
  RAISE NOTICE '[020] Verify — multi-offer groups remaining: % (expect 0)', n;

  SELECT COUNT(*) INTO n FROM card_offers WHERE is_active = true;
  RAISE NOTICE '[020] Verify — total active offers: %', n;

END $$;

-- ── Tabular output for psql / SQL editor ──────────────────────────────────────

SELECT COUNT(*) AS active_p3_p4_remaining
FROM   card_offers
WHERE  is_active = true AND source_priority IN (3, 4);

SELECT COUNT(*) AS multi_offer_groups_remaining
FROM (
  SELECT card_id, offer_type, source_priority
  FROM   card_offers
  WHERE  is_active = true
  GROUP  BY card_id, offer_type, source_priority
  HAVING COUNT(*) > 1
) dup;

SELECT COUNT(*) AS total_active_offers
FROM   card_offers
WHERE  is_active = true;

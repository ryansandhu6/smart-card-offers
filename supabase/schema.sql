-- ============================================================
-- Smart Card Offers — Supabase Schema
-- Single source of truth — includes all migrations 001–003.
-- Run this in your Supabase SQL editor to set up a fresh database.
-- ============================================================

-- -----------------------------------------------
-- ISSUERS (American Express, TD, Scotiabank, etc.)
-- -----------------------------------------------
CREATE TABLE issuers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------
-- CREDIT CARDS
-- -----------------------------------------------
CREATE TABLE credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id UUID REFERENCES issuers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  card_type TEXT CHECK (card_type IN ('visa', 'mastercard', 'amex', 'discover')),
  card_network TEXT,                        -- "Visa", "Mastercard", "American Express"
  tier TEXT CHECK (tier IN ('no-fee', 'entry', 'mid', 'premium', 'super-premium')),
  annual_fee NUMERIC(8,2) DEFAULT 0,
  annual_fee_waived_first_year BOOLEAN DEFAULT false,
  rewards_program TEXT,                     -- e.g. "Amex MR", "Aeroplan", "Scene+"
  rewards_type TEXT CHECK (rewards_type IN ('points', 'cashback', 'hybrid')),
  earn_rate_base NUMERIC(5,2),              -- e.g. 1.0 point per $1
  earn_rate_multipliers JSONB,              -- {"dining": 3, "groceries": 2}
  transfer_partners JSONB,                  -- ["Air Canada", "British Airways"]
  lounge_access BOOLEAN DEFAULT false,
  travel_insurance BOOLEAN DEFAULT false,
  purchase_protection BOOLEAN DEFAULT false,
  foreign_transaction_fee NUMERIC(4,2),
  credit_score_min TEXT CHECK (credit_score_min IN ('fair', 'good', 'very-good', 'excellent')),
  apply_url TEXT,
  referral_url TEXT,                        -- YOUR affiliate/referral link
  image_url TEXT,
  -- Display / marketing fields (migration 001)
  short_description TEXT,
  pros TEXT[],
  cons TEXT[],
  best_for TEXT[],
  min_income INTEGER,
  card_color TEXT,
  -- Income / fee fields (migration 006)
  income_type TEXT,                             -- 'personal' | 'household' | 'business'
  supplementary_card_fee NUMERIC(8,2),          -- Annual fee per additional cardholder
  -- Travel benefit fields (migration 006)
  mobile_wallet TEXT[],                         -- ['Apple Pay', 'Google Pay', 'Samsung Pay']
  extended_warranty BOOLEAN DEFAULT false,
  price_protection BOOLEAN DEFAULT false,
  rental_car_insurance BOOLEAN DEFAULT false,
  airport_lounge_network TEXT,                  -- 'Priority Pass' | 'Amex Centurion' | etc.
  signup_bonus_description TEXT,                -- Human-readable welcome bonus summary
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  tags TEXT[],                              -- ["travel", "no-fx-fee", "aeroplan"]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------
-- CARD OFFERS (welcome bonuses, limited-time)
-- -----------------------------------------------
CREATE TABLE card_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES credit_cards(id) ON DELETE CASCADE,
  offer_type TEXT CHECK (offer_type IN ('welcome_bonus', 'limited_time', 'retention', 'referral')),
  headline TEXT NOT NULL,                   -- "70,000 Amex MR points"
  details TEXT,                             -- Full offer description
  points_value INTEGER,                     -- Raw points/miles offered
  cashback_value NUMERIC(8,2),              -- If cash back offer
  spend_requirement NUMERIC(10,2),          -- e.g. 10000
  spend_timeframe_days INTEGER,             -- e.g. 90
  extra_perks TEXT[],                       -- ["First year fee waived", "Priority Pass"]
  is_limited_time BOOLEAN DEFAULT false,
  expires_at DATE,
  is_verified BOOLEAN DEFAULT false,        -- Manually verified by you
  source_url TEXT,                          -- Where we scraped/found this
  scraped_at TIMESTAMPTZ,
  -- Data trust system (migration 003)
  source_priority INTEGER NOT NULL DEFAULT 2,  -- 1=bank-direct, 2=aggregator, 3=hardcoded
  last_seen_at TIMESTAMPTZ,
  confidence_score INTEGER,
  is_better_than_usual BOOLEAN NOT NULL DEFAULT false,  -- migration 008
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Unique constraint required for upsert onConflict (migration 002)
  CONSTRAINT card_offers_card_offer_headline_key UNIQUE (card_id, offer_type, headline)
);

-- -----------------------------------------------
-- MORTGAGE RATES
-- -----------------------------------------------
CREATE TABLE mortgage_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender TEXT NOT NULL,
  lender_slug TEXT NOT NULL,
  rate_type TEXT CHECK (rate_type IN ('fixed', 'variable', 'hybrid')),
  term_years INTEGER,                        -- 1, 2, 3, 5, 10
  rate NUMERIC(5,3) NOT NULL,                -- e.g. 5.240
  posted_rate NUMERIC(5,3),                  -- Bank's posted (non-discounted) rate
  insured_rate NUMERIC(5,3),
  uninsured_rate NUMERIC(5,3),
  source_url TEXT,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  UNIQUE (lender_slug, rate_type, term_years)
);

-- -----------------------------------------------
-- POINTS VALUATIONS (cpp = cents per point)
-- -----------------------------------------------
CREATE TABLE points_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program TEXT NOT NULL,                     -- "Amex MR", "Aeroplan"
  cpp_low NUMERIC(5,3),                      -- Conservative estimate
  cpp_mid NUMERIC(5,3),                      -- Our recommended value
  cpp_high NUMERIC(5,3),                     -- Aspirational (business class etc.)
  methodology TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------
-- NEWSLETTER SUBSCRIBERS
-- -----------------------------------------------
CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  source TEXT,                               -- "homepage", "card-page", "blog"
  is_confirmed BOOLEAN DEFAULT false,
  confirmation_token TEXT,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  tags TEXT[]                                -- For segmentation: ["churner", "beginner"]
);

-- -----------------------------------------------
-- REFERRAL CLICKS (track your affiliate traffic)
-- -----------------------------------------------
CREATE TABLE referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES credit_cards(id),
  offer_id UUID REFERENCES card_offers(id),
  source_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  ip_hash TEXT,                              -- Hashed for privacy
  user_agent TEXT,
  clicked_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------
-- BLOG POSTS (if using Supabase instead of Sanity)
-- -----------------------------------------------
CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content_mdx TEXT,
  author TEXT DEFAULT 'Smart Card Offers',
  cover_image TEXT,
  category TEXT CHECK (category IN (
    'how-to', 'card-review', 'points-guide',
    'transfer-partners', 'news', 'deals'
  )),
  tags TEXT[],
  related_card_ids UUID[],
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------
-- SCRAPE LOGS (track scraper health)
-- -----------------------------------------------
CREATE TABLE scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('success', 'partial', 'failed')),
  records_found INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,  -- offers blocked by source-priority guard
  error_message TEXT,
  duration_ms INTEGER,
  ran_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------
-- UPDATED_AT AUTO-UPDATE TRIGGER
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_cards_updated_at
  BEFORE UPDATE ON credit_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER card_offers_updated_at
  BEFORE UPDATE ON card_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------
-- INDEXES
-- -----------------------------------------------
CREATE INDEX idx_cards_issuer ON credit_cards(issuer_id);
CREATE INDEX idx_cards_tags ON credit_cards USING GIN(tags);
CREATE INDEX idx_cards_active ON credit_cards(is_active);
CREATE INDEX idx_cards_best_for ON credit_cards USING GIN(best_for);
CREATE INDEX idx_offers_card ON card_offers(card_id);
CREATE INDEX idx_offers_active_limited ON card_offers(is_active, is_limited_time);
CREATE INDEX idx_offers_expires ON card_offers(expires_at);
-- Trust system indexes (migration 003)
CREATE INDEX idx_offers_priority_points
  ON card_offers(source_priority ASC, points_value DESC NULLS LAST)
  WHERE is_active = true;
CREATE INDEX idx_offers_last_seen
  ON card_offers(last_seen_at)
  WHERE is_active = true;
CREATE INDEX idx_mortgage_rates_type_term ON mortgage_rates(rate_type, term_years);
CREATE INDEX idx_blog_published ON blog_posts(is_published, published_at DESC);
CREATE INDEX idx_scrape_logs_name_ran ON scrape_logs(scraper_name, ran_at DESC);

-- -----------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;

-- Public can read cards, offers, mortgage rates, blog, valuations
CREATE POLICY "Public read cards"         ON credit_cards      FOR SELECT USING (is_active = true);
CREATE POLICY "Public read offers"        ON card_offers       FOR SELECT USING (is_active = true);
CREATE POLICY "Public read mortgage rates" ON mortgage_rates   FOR SELECT USING (is_active = true);
CREATE POLICY "Public read blog"          ON blog_posts        FOR SELECT USING (is_published = true);
CREATE POLICY "Public read valuations"    ON points_valuations FOR SELECT USING (true);

-- Only service role can write (your scrapers use service role key)
CREATE POLICY "Service role full access newsletter"
  ON newsletter_subscribers USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access clicks"
  ON referral_clicks USING (auth.role() = 'service_role');

-- -----------------------------------------------
-- SEED ISSUERS
-- -----------------------------------------------
INSERT INTO issuers (name, slug, website) VALUES
  ('American Express', 'amex',         'https://www.americanexpress.com/ca'),
  ('TD',               'td',           'https://www.td.com/ca/en/personal-banking/products/credit-cards'),
  ('Scotiabank',       'scotiabank',   'https://www.scotiabank.com/ca/en/personal/credit-cards.html'),
  ('BMO',              'bmo',          'https://www.bmo.com/en-ca/main/personal/credit-cards'),
  ('CIBC',             'cibc',         'https://www.cibc.com/en/personal-banking/credit-cards.html'),
  ('RBC',              'rbc',          'https://www.rbcroyalbank.com/credit-cards/index.html'),
  ('National Bank',    'national-bank','https://www.nbc.ca/personal/credit-cards.html'),
  ('HSBC',             'hsbc',         'https://www.hsbc.ca/credit-cards'),
  ('Tangerine',        'tangerine',    'https://www.tangerine.ca/en/products/spending/creditcard'),
  ('PC Financial',     'pc-financial', 'https://www.pcfinancial.ca/en/credit-cards'),
  ('Desjardins',       'desjardins',   'https://www.desjardins.com/ca/personal/accounts-services/credit-cards'),
  ('MBNA',             'mbna',         'https://www.mbna.ca'),
  ('Rogers Bank',      'rogers-bank',  'https://www.rogersbank.com'),
  -- Added 2026-03-24: additional issuers from Prince of Travel scraper
  ('Brim Financial',   'brim',         'https://www.brimfinancial.com'),
  ('Neo Financial',    'neo-financial','https://www.neo.ca'),
  ('Canadian Tire Bank','canadian-tire','https://www.triangle.ca'),
  ('Home Trust',       'home-trust',   'https://www.hometrust.ca/credit-cards'),
  ('Laurentian Bank',  'laurentian-bank','https://www.laurentianbank.ca'),
  ('Meridian',         'meridian',     'https://www.meridiancu.ca/personal/banking/credit-cards'),
  ('Simplii Financial','simplii',      'https://www.simplii.com/en/credit-cards.html');

-- -----------------------------------------------
-- SEED POINTS VALUATIONS
-- -----------------------------------------------
INSERT INTO points_valuations (program, cpp_low, cpp_mid, cpp_high, methodology) VALUES
  ('Amex MR',       1.0, 1.8, 2.5, 'Based on Air Canada business class transfer at 1:1'),
  ('Aeroplan',      1.2, 2.0, 3.0, 'Based on partner redemptions; Star Alliance business class'),
  ('Scene+',        0.8, 1.0, 1.0, 'Fixed 1cpp at Cineplex/groceries'),
  ('BMO Rewards',   0.5, 0.67, 0.67,'Fixed redemption toward travel'),
  ('CIBC Aventura', 0.8, 1.0, 1.5, 'Best through CIBC Aventura travel portal'),
  ('RBC Avion',     0.8, 1.3, 2.0, 'British Airways transfer and WestJet redemptions'),
  ('WestJet Dollars',1.0, 1.0, 1.0,'Fixed 1:1 toward WestJet flights');

-- -----------------------------------------------
-- MIGRATION 005: OFFER HISTORY
-- -----------------------------------------------
CREATE TABLE offer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  offer_type TEXT NOT NULL,
  headline TEXT NOT NULL,
  points_value INTEGER,
  cashback_value NUMERIC(5,2),
  spend_requirement NUMERIC(10,2),
  spend_timeframe_days INTEGER,
  source_priority INTEGER,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_offer_history_card_id ON offer_history(card_id);
CREATE INDEX idx_offer_history_points_value ON offer_history(card_id, points_value DESC);

-- An offer is "better than usual" if its points_value or cashback_value
-- is higher than the average for that card over the last 12 months
CREATE OR REPLACE VIEW offer_history_stats AS
SELECT
  card_id,
  offer_type,
  MAX(points_value) as all_time_high_points,
  ROUND(AVG(points_value)) as avg_points_12mo,
  MAX(cashback_value) as all_time_high_cashback,
  ROUND(AVG(cashback_value)::numeric, 2) as avg_cashback_12mo,
  COUNT(*) as total_offers_seen
FROM offer_history
WHERE first_seen_at > now() - interval '12 months'
GROUP BY card_id, offer_type;

-- -----------------------------------------------
-- MIGRATION 008: is_better_than_usual trigger
-- -----------------------------------------------
-- Keeps card_offers.is_better_than_usual in sync automatically.
-- Fires BEFORE INSERT OR UPDATE; compares incoming value against
-- the 90-day rolling average from offer_history.
CREATE OR REPLACE FUNCTION refresh_is_better_than_usual()
RETURNS TRIGGER AS $$
DECLARE
  v_avg_points   NUMERIC;
  v_avg_cashback NUMERIC;
BEGIN
  SELECT AVG(points_value), AVG(cashback_value)
  INTO v_avg_points, v_avg_cashback
  FROM offer_history
  WHERE card_id    = NEW.card_id
    AND offer_type = NEW.offer_type
    AND first_seen_at > now() - interval '90 days';

  NEW.is_better_than_usual :=
    COALESCE(NEW.points_value   > v_avg_points,   false)
    OR
    COALESCE(NEW.cashback_value > v_avg_cashback, false);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_card_offers_is_better_than_usual
  BEFORE INSERT OR UPDATE
  ON card_offers
  FOR EACH ROW
  EXECUTE FUNCTION refresh_is_better_than_usual();

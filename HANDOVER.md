# Smart Card Offers — Backend Handover Document

> Last updated: 2026-03-24 (scraper simplification — 5 active scrapers, ~202 offers)
> This document covers the full backend for smartcardoffers.ca — a Canadian credit card comparison and offers aggregation site.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Variables](#4-environment-variables)
5. [API Endpoints](#5-api-endpoints)
6. [Database Schema](#6-database-schema)
7. [Scraper System](#7-scraper-system)
8. [Data Quality Notes](#8-data-quality-notes)
9. [Points Valuations — Dollar Value Calculation](#9-points-valuations--dollar-value-calculation)
10. [Card Images](#10-card-images)
11. [Running Scrapers Manually](#11-running-scrapers-manually)
12. [Known Gaps and Future Improvements](#12-known-gaps-and-future-improvements)
13. [Frontend Developer Setup & Collaboration](#13-frontend-developer-setup--collaboration)

---

## 1. Project Overview

Smart Card Offers aggregates Canadian credit card welcome bonuses, limited-time offers, and mortgage rates. The goal is to be the most up-to-date, trust-ranked source for Canadian card offers.

**What it does:**
- Scrapes 5 data sources (bank websites, aggregator sites, community GitHub repo)
- Stores offers in Supabase with a trust/priority system — bank-direct data wins over aggregator data
- Exposes a clean JSON API consumed by the Next.js frontend
- Tracks referral clicks for affiliate revenue attribution
- Sends welcome emails to newsletter subscribers via Resend

**Target audience:** Canadian credit card enthusiasts, points collectors, and everyday users looking for the best signup bonuses.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL + PostgREST + Row Level Security) |
| Scraping | Cheerio (HTML parsing), Playwright (JS-rendered pages), fetch |
| Email | Resend |
| Hosting | Vercel (cron at 06:00 UTC daily via `vercel.json`) |
| Styling | Tailwind CSS v4 |

---

## 3. Project Structure

```
smart-card-offers/
├── app/
│   ├── api/
│   │   ├── blog/route.ts           GET published blog posts
│   │   ├── cards/route.ts          GET cards list with filters
│   │   ├── cards/[slug]/route.ts   GET single card by slug
│   │   ├── mortgage-rates/route.ts GET mortgage rates grouped
│   │   ├── newsletter/route.ts     POST subscribe email
│   │   ├── offers/route.ts         GET active offers list
│   │   ├── scrape/route.ts         POST/GET run all scrapers (CRON)
│   │   ├── scrape-logs/route.ts    GET last 50 scrape log entries
│   │   ├── track-click/route.ts    POST log referral click
│   │   └── valuations/route.ts     GET points valuations (cpp)
│   └── page.tsx                    Homepage
├── lib/
│   ├── supabase.ts                 DB clients + query helpers
│   └── scraper-base.ts             BaseScraper + BaseMortgageScraper
├── scrapers/
│   ├── amex.ts                     American Express scraper (active)
│   ├── td.ts                       TD Bank scraper (active)
│   ├── churningcanada.ts           r/churningcanada GitHub README (active)
│   ├── aggregators.ts              MintFlying, PrinceOfTravel (active)
│   ├── banks.ts                    Scotiabank, BMO, RBC, CIBC (inactive — kept for future use)
│   ├── mortgage-rates.ts           Ratehub, BigBank mortgage scrapers (inactive — kept for future use)
│   └── playwright-scraper.ts       PlaywrightScraper base class (inactive scrapers removed)
├── scripts/
│   ├── run-scrapers.ts             CLI entry point for manual scrapes
│   ├── seed-cards.ts               Seed credit_cards + issuers
│   └── download-card-images.ts     Download card images locally
├── types/index.ts                  Shared TypeScript interfaces
├── supabase/schema.sql             Full DB schema (single source of truth)
├── vercel.json                     Cron config + CORS headers + redirects
└── HANDOVER.md                     This document
```

---

## 4. Environment Variables

All variables must be set in `.env.local` for local development and in Vercel's Environment Variables panel for production.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL. Safe to expose to browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key. Safe to expose. Respects Row Level Security. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key. **Never expose to browser.** Bypasses RLS. Used by all API routes and scrapers. |
| `CRON_SECRET` | ✅ | Secret token protecting `/api/scrape`. Set the same value in Vercel's cron headers config. |
| `RESEND_API_KEY` | ✅ | Resend API key for sending newsletter welcome emails. |
| `IP_HASH_SALT` | ✅ | Salt added to IP addresses before SHA-256 hashing in `/api/track-click`. Set to any random string. Without this, defaults to `'default-salt'` (insecure). |

### Local `.env.local` example

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CRON_SECRET=your-secret-random-string
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
IP_HASH_SALT=another-random-string-32chars
```

---

## 5. API Endpoints

All endpoints are under `/api/`. CORS headers (`Access-Control-Allow-Origin: *`) are applied globally via `vercel.json`.

---

### `GET /api/cards`

Returns a paginated list of active credit cards with their issuer details and current best offer.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `issuer` | string | — | Filter by issuer slug. Valid values: `amex`, `td`, `scotiabank`, `bmo`, `rbc`, `cibc`, `national-bank`, `hsbc`, `tangerine`, `pc-financial`, `desjardins`, `mbna`, `rogers-bank`, `brim`, `neo-financial`, `canadian-tire`, `home-trust`, `laurentian-bank`, `meridian`, `simplii`. Unknown slug returns `[]`. |
| `tier` | string | — | Filter by card tier: `no-fee`, `entry`, `mid`, `premium`, `super-premium` |
| `rewards_type` | string | — | Filter by rewards type: `points`, `cashback`, `hybrid` |
| `tags` | string | — | Comma-separated tags to match (any match). e.g. `travel,aeroplan` |
| `featured` | `"true"` | — | If `"true"`, return only featured cards |
| `page` | integer | `1` | Page number (1-indexed) |
| `limit` | integer | `20` | Results per page. Maximum `100`. |

**Ordering:** Featured cards first, then remaining active cards.

**Example response:**
```json
{
  "cards": [
    {
      "id": "uuid",
      "name": "American Express Cobalt Card",
      "slug": "amex-cobalt",
      "card_type": "amex",
      "tier": "entry",
      "annual_fee": 155.88,
      "rewards_program": "Amex MR",
      "rewards_type": "points",
      "earn_rate_base": 1.0,
      "earn_rate_multipliers": { "dining": 5, "groceries": 5, "streaming": 3, "travel": 2 },
      "lounge_access": false,
      "travel_insurance": true,
      "is_featured": true,
      "image_url": "/images/cards/amex-cobalt.png",
      "tags": ["travel", "dining", "no-fx-fee"],
      "issuer": {
        "id": "uuid",
        "name": "American Express",
        "slug": "amex",
        "website": "https://www.americanexpress.com/ca"
      },
      "current_offer": [
        {
          "id": "uuid",
          "offer_type": "welcome_bonus",
          "headline": "22,000 Amex MR points after $750 spend per month for 12 months",
          "points_value": 22000,
          "cashback_value": null,
          "spend_requirement": 750,
          "spend_timeframe_days": 360,
          "is_limited_time": false,
          "is_verified": true,
          "source_priority": 1,
          "confidence_score": 100,
          "expires_at": null
        }
      ]
    }
  ],
  "count": 1
}
```

**Notes:**
- `current_offer` is an array (a card can have multiple active offers). The array is pre-filtered to `is_active = true`.
- `earn_rate_multipliers` uses standardized keys: `groceries`, `dining`, `gas`, `travel`, `transit`, `streaming`, `drugstore`, `foreign_currency`, `other`.
- `image_url` may be `null` — see [Card Images](#10-card-images).

---

### `GET /api/cards/:slug`

Returns a single card by its URL slug with full offer details.

**Path parameter:** `slug` — the card's URL-safe slug (e.g. `amex-cobalt`)

**Example response:**
```json
{
  "card": {
    "id": "uuid",
    "name": "American Express Cobalt Card",
    "slug": "amex-cobalt",
    "short_description": "Best everyday earn rate in Canada for dining and groceries",
    "pros": ["5x on dining and groceries", "No FX fees"],
    "cons": ["Monthly fee structure"],
    "best_for": ["dining", "travel", "beginners"],
    "issuer": { "id": "uuid", "name": "American Express", "slug": "amex" },
    "offers": [
      {
        "id": "uuid",
        "offer_type": "welcome_bonus",
        "headline": "22,000 Amex MR points after $750 spend per month for 12 months",
        "details": "Earn 2,500 MR points for each billing period in which you spend $750...",
        "points_value": 22000,
        "cashback_value": null,
        "spend_requirement": 750,
        "spend_timeframe_days": 360,
        "extra_perks": ["No foreign transaction fees"],
        "is_limited_time": false,
        "expires_at": null,
        "is_verified": true,
        "source_priority": 1,
        "confidence_score": 100,
        "source_url": "https://www.americanexpress.com/ca/credit-cards/cobalt-card/",
        "last_seen_at": "2026-03-24T06:00:00.000Z"
      }
    ]
  }
}
```

**Returns 404** if no active card matches the slug.

---

### `GET /api/offers`

Returns active card offers sorted by trust rank (bank-direct first, then highest points/cashback).

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limited` | `"true"` | — | If `"true"`, return only limited-time offers |
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Results per page. Maximum `100`. |

**Ordering:** `source_priority ASC` → `points_value DESC` → `cashback_value DESC` → `confidence_score DESC`

**Example response:**
```json
{
  "offers": [
    {
      "id": "uuid",
      "card_id": "uuid",
      "offer_type": "welcome_bonus",
      "headline": "90,000 Aeroplan points after $7,500 spend in 3 months",
      "points_value": 90000,
      "cashback_value": null,
      "spend_requirement": 7500,
      "spend_timeframe_days": 90,
      "is_limited_time": false,
      "is_verified": true,
      "source_priority": 1,
      "confidence_score": 100,
      "expires_at": null,
      "card": {
        "name": "American Express® Aeroplan®* Reserve Card",
        "slug": "amex-aeroplan-reserve",
        "image_url": "/images/cards/amex-aeroplan-reserve.png",
        "issuer": { "slug": "amex", "name": "American Express" }
      }
    }
  ],
  "count": 20,
  "page": 1,
  "limit": 20
}
```

**Notes:**
- `cashback_value` is a percentage (e.g. `10.0` means 10%) for cashback offers, `null` for points offers.
- `points_value` is `null` for cashback offers.
- Never show both as non-null simultaneously.

---

### `GET /api/valuations`

Returns points program valuations in cents-per-point (cpp).

**No query parameters.**

**Example response:**
```json
{
  "valuations": [
    {
      "id": "uuid",
      "program": "Aeroplan",
      "cpp_low": 1.2,
      "cpp_mid": 2.0,
      "cpp_high": 3.0,
      "methodology": "Based on partner redemptions; Star Alliance business class",
      "updated_at": "2026-03-24T00:00:00.000Z"
    },
    {
      "program": "Amex MR",
      "cpp_low": 1.0,
      "cpp_mid": 1.8,
      "cpp_high": 2.5,
      "methodology": "Based on Air Canada business class transfer at 1:1"
    }
  ],
  "count": 7
}
```

**Available programs:** Amex MR, Aeroplan, Scene+, BMO Rewards, CIBC Aventura, RBC Avion, WestJet Dollars

See [Section 9](#9-points-valuations--dollar-value-calculation) for how to use these values.

---

### `GET /api/mortgage-rates`

Returns active mortgage rates, both flat and grouped by type/term.

**No query parameters.**

**Example response:**
```json
{
  "rates": [
    {
      "id": "uuid",
      "lender": "TD Bank",
      "lender_slug": "td",
      "rate_type": "fixed",
      "term_years": 5,
      "rate": 4.890,
      "posted_rate": 6.340,
      "insured_rate": 4.790,
      "uninsured_rate": 4.890,
      "source_url": "https://www.ratehub.ca/mortgage-rates",
      "scraped_at": "2026-03-24T06:00:00.000Z"
    }
  ],
  "grouped": {
    "fixed": {
      "1": [...],
      "2": [...],
      "3": [...],
      "5": [...],
      "10": [...]
    },
    "variable": {
      "5": [...]
    }
  }
}
```

---

### `GET /api/blog`

Returns published blog posts with pagination.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number |
| `limit` | integer | `10` | Results per page. Maximum `50`. |
| `category` | string | — | Filter by category: `how-to`, `card-review`, `points-guide`, `transfer-partners`, `news`, `deals` |

**Example response:**
```json
{
  "posts": [
    {
      "id": "uuid",
      "title": "Best Credit Cards for Dining in Canada 2026",
      "slug": "best-dining-cards-canada-2026",
      "excerpt": "Earn up to 5x points on every restaurant visit.",
      "author": "Smart Card Offers",
      "cover_image": "/images/blog/dining-cards.jpg",
      "category": "card-review",
      "tags": ["dining", "amex", "cobalt"],
      "published_at": "2026-03-01T00:00:00.000Z",
      "seo_title": "Best Dining Credit Cards Canada 2026",
      "seo_description": "Compare the top dining credit cards in Canada..."
    }
  ],
  "page": 1,
  "limit": 10,
  "count": 1
}
```

**Note:** `content_mdx` is intentionally excluded from list responses. Fetch the full post separately by slug from Supabase directly if you need the body.

---

### `GET /api/scrape-logs`

Returns the last 50 scrape log entries, useful for a health dashboard.

**No query parameters.**

**Example response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "scraper_name": "churningcanada",
      "status": "success",
      "records_found": 33,
      "records_updated": 33,
      "error_message": null,
      "duration_ms": 4210,
      "ran_at": "2026-03-24T06:00:00.000Z"
    }
  ],
  "by_scraper": {
    "churningcanada": [...],
    "amex": [...],
    "td": [...]
  },
  "count": 50
}
```

**Notes:**
- Internal SHA-tracking entries (`churningcanada-sha`) are excluded.
- `status` values: `success`, `partial` (some offers failed to save), `failed` (entire scrape threw).
- `records_found` = offers parsed from the source; `records_updated` = offers written to DB.

---

### `POST /api/scrape`

Runs all scrapers in sequence. Protected endpoint — requires `Authorization: Bearer {CRON_SECRET}` header.

**Also accepts GET** — Vercel cron jobs call GET, so the GET handler forwards to POST.

**Request:** No body required. Authorization header only.

**Example response:**
```json
{
  "ran_at": "2026-03-24T06:00:00.000Z",
  "total_scrapers": 5,
  "total_updated": 202,
  "results": [
    { "scraper": "churningcanada",  "status": "success", "records_found": 33, "records_updated": 0,  "duration_ms": 139 },
    { "scraper": "amex",            "status": "success", "records_found": 6,  "records_updated": 6,  "duration_ms": 3200 },
    { "scraper": "td",              "status": "success", "records_found": 1,  "records_updated": 1,  "duration_ms": 1800 },
    { "scraper": "mintflying",      "status": "success", "records_found": 65, "records_updated": 65, "duration_ms": 5400 },
    { "scraper": "princeoftravel",  "status": "success", "records_found": 97, "records_updated": 97, "duration_ms": 485000 }
  ]
}
```

**Returns 401** if `CRON_SECRET` is missing or the Authorization header doesn't match.

**Scraper execution order:**
1. churningcanada (priority 1, SHA-gated community data)
2. amex (priority 2, bank-direct)
3. td (priority 2, bank-direct)
4. mintflying (priority 3, aggregator)
5. princeoftravel (priority 1, curated — ~8 min, visits 102 card pages, overwrites lower-priority rows)

---

### `POST /api/track-click`

Logs a referral click event to the `referral_clicks` table.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `card_id` | string (UUID) | No | Card the user clicked on |
| `offer_id` | string (UUID) | No | Specific offer clicked |
| `source_page` | string | No | Page slug where the click occurred (e.g. `"card-page"`, `"homepage"`) |

**Example response:**
```json
{ "success": true }
```

**Notes:**
- The user's IP is hashed with SHA-256 + `IP_HASH_SALT` before storage. Only the first 16 hex chars are stored.
- `user_agent` is captured automatically from the request headers.
- Call this before redirecting the user to the apply URL.

---

### `POST /api/newsletter`

Subscribes an email to the newsletter. Upserts on duplicate email (idempotent).

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | ✅ | Subscriber email |
| `first_name` | string | No | Used in welcome email greeting |
| `source` | string | No | Where the form was shown: `"homepage"`, `"card-page"`, etc. |

**Example response:**
```json
{ "success": true }
```

**Returns 400** for invalid/missing email.

**Notes:**
- Sends a welcome email via Resend from `hello@smartcardoffers.ca`.
- Requires `RESEND_API_KEY` to be set.

---

## 6. Database Schema

Full schema: `supabase/schema.sql` — this is the single source of truth. Run it fresh in Supabase SQL editor for new databases.

---

### `issuers`

Seeded at init. 20 Canadian card issuers.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | TEXT | e.g. `"American Express"` |
| `slug` | TEXT | URL slug, unique. e.g. `"amex"`, `"td"`, `"scotiabank"` |
| `logo_url` | TEXT | Issuer logo |
| `website` | TEXT | Issuer's credit card listing URL |

**Seeded slugs:** `amex`, `td`, `scotiabank`, `bmo`, `cibc`, `rbc`, `national-bank`, `hsbc`, `tangerine`, `pc-financial`, `desjardins`, `mbna`, `rogers-bank`, `brim`, `neo-financial`, `canadian-tire`, `home-trust`, `laurentian-bank`, `meridian`, `simplii`

---

### `credit_cards`

One row per card product. Seeded via `scripts/seed-cards.ts`. Scrapers can create stub rows.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `issuer_id` | UUID | FK → issuers |
| `name` | TEXT | Full card name |
| `slug` | TEXT | Unique URL slug |
| `card_type` | TEXT | `visa`, `mastercard`, `amex`, `discover` |
| `card_network` | TEXT | e.g. `"Visa"`, `"Mastercard"` |
| `tier` | TEXT | `no-fee`, `entry`, `mid`, `premium`, `super-premium` |
| `annual_fee` | NUMERIC | Annual fee in CAD |
| `annual_fee_waived_first_year` | BOOLEAN | |
| `rewards_program` | TEXT | e.g. `"Amex MR"`, `"Aeroplan"`, `"Scene+"` |
| `rewards_type` | TEXT | `points`, `cashback`, `hybrid` |
| `earn_rate_base` | NUMERIC | Base earn rate (points per $1) |
| `earn_rate_multipliers` | JSONB | `{ "dining": 5, "groceries": 5 }` — standardized keys |
| `transfer_partners` | JSONB | Array of partner program names |
| `lounge_access` | BOOLEAN | |
| `travel_insurance` | BOOLEAN | |
| `purchase_protection` | BOOLEAN | |
| `foreign_transaction_fee` | NUMERIC | % fee; `null` if no FX fee |
| `credit_score_min` | TEXT | `fair`, `good`, `very-good`, `excellent` |
| `apply_url` | TEXT | Direct application URL |
| `referral_url` | TEXT | Affiliate/referral link |
| `image_url` | TEXT | Card image path — may be null |
| `short_description` | TEXT | 1-line marketing description |
| `pros` | TEXT[] | Bullet point pros |
| `cons` | TEXT[] | Bullet point cons |
| `best_for` | TEXT[] | Tags like `["travel", "dining"]` |
| `min_income` | INTEGER | Minimum income requirement in CAD |
| `card_color` | TEXT | CSS color string |
| `is_active` | BOOLEAN | False = soft-deleted, excluded from public API |
| `is_featured` | BOOLEAN | Pinned to top of listings |
| `tags` | TEXT[] | GIN-indexed tags for filtering |

**RLS:** Public read where `is_active = true`. Writes require service role.

---

### `card_offers`

One row per unique (card, offer_type, headline) combination.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `card_id` | UUID | FK → credit_cards |
| `offer_type` | TEXT | `welcome_bonus`, `limited_time`, `retention`, `referral` |
| `headline` | TEXT | Human-readable offer summary. Part of unique key. |
| `details` | TEXT | Full description |
| `points_value` | INTEGER | Raw points offered. Null for cashback. |
| `cashback_value` | NUMERIC | Cashback as a percentage (e.g. `10.0` = 10%). Null for points. |
| `spend_requirement` | NUMERIC | Minimum spend to qualify (CAD) |
| `spend_timeframe_days` | INTEGER | Days to meet spend requirement |
| `extra_perks` | TEXT[] | e.g. `["First year fee waived", "Priority Pass"]` |
| `is_limited_time` | BOOLEAN | True if the offer has an expiry |
| `expires_at` | DATE | Offer expiry date |
| `is_verified` | BOOLEAN | Manually or source-verified |
| `source_url` | TEXT | Where the offer was found |
| `scraped_at` | TIMESTAMPTZ | When the scraper last fetched it |
| `source_priority` | INTEGER | **1** = bank-direct, **2** = aggregator, **3** = hardcoded |
| `last_seen_at` | TIMESTAMPTZ | Last time this offer appeared in a scrape run |
| `confidence_score` | INTEGER | 0–100 computed score (see trust system) |
| `is_active` | BOOLEAN | Set to false if not seen in 7+ days |

**Unique constraint:** `(card_id, offer_type, headline)` — prevents duplicates, enables upsert.

**RLS:** Public read where `is_active = true`. Writes require service role.

---

### `mortgage_rates`

| Column | Type | Notes |
|---|---|---|
| `lender` | TEXT | Full lender name |
| `lender_slug` | TEXT | URL slug |
| `rate_type` | TEXT | `fixed`, `variable`, `hybrid` |
| `term_years` | INTEGER | 1, 2, 3, 5, or 10 |
| `rate` | NUMERIC | Best available rate (%) |
| `posted_rate` | NUMERIC | Bank's posted (non-discounted) rate |
| `insured_rate` | NUMERIC | Rate for insured mortgages |
| `uninsured_rate` | NUMERIC | Rate for uninsured mortgages |

**Unique constraint:** `(lender_slug, rate_type, term_years)`

---

### `points_valuations`

Seeded at init. Updated manually.

| Column | Type | Notes |
|---|---|---|
| `program` | TEXT | e.g. `"Amex MR"`, `"Aeroplan"` |
| `cpp_low` | NUMERIC | Conservative valuation (cents per point) |
| `cpp_mid` | NUMERIC | Our recommended valuation |
| `cpp_high` | NUMERIC | Aspirational (business class redemptions) |
| `methodology` | TEXT | How the value was derived |

---

### `newsletter_subscribers`

| Column | Type | Notes |
|---|---|---|
| `email` | TEXT | Unique, PK for upserts |
| `first_name` | TEXT | |
| `source` | TEXT | Where they signed up |
| `is_confirmed` | BOOLEAN | Double opt-in confirmation (not yet wired up) |
| `tags` | TEXT[] | Segmentation tags: `["churner", "beginner"]` |

**RLS:** Service role only. No public read.

---

### `referral_clicks`

| Column | Type | Notes |
|---|---|---|
| `card_id` | UUID | FK → credit_cards (nullable) |
| `offer_id` | UUID | FK → card_offers (nullable) |
| `source_page` | TEXT | Page where click happened |
| `ip_hash` | TEXT | First 16 hex chars of SHA-256(ip + salt) |
| `user_agent` | TEXT | |
| `clicked_at` | TIMESTAMPTZ | |

**RLS:** Service role only. No public read.

---

### `blog_posts`

| Column | Type | Notes |
|---|---|---|
| `title` | TEXT | |
| `slug` | TEXT | Unique URL slug |
| `content_mdx` | TEXT | Full MDX content (excluded from list API) |
| `category` | TEXT | `how-to`, `card-review`, `points-guide`, `transfer-partners`, `news`, `deals` |
| `is_published` | BOOLEAN | Only published posts appear in API |
| `related_card_ids` | UUID[] | Link posts to cards |

---

### `scrape_logs`

Append-only log of every scraper run.

| Column | Type | Notes |
|---|---|---|
| `scraper_name` | TEXT | e.g. `"amex"`, `"churningcanada"` |
| `status` | TEXT | `success`, `partial`, `failed` |
| `records_found` | INTEGER | Offers parsed from source |
| `records_updated` | INTEGER | Offers written to DB |
| `error_message` | TEXT | Error string on failure. **Also used by `churningcanada-sha` to store SHA as `sha:{sha}`** |
| `duration_ms` | INTEGER | Run time in milliseconds |

---

## 7. Scraper System

### How it works

Each scraper extends `BaseScraper` (card scrapers) or `BaseMortgageScraper` (mortgage scrapers) from `lib/scraper-base.ts`.

**Lifecycle of a scrape run:**

1. `run()` is called — records start time
2. `scrape()` is called — returns `ScrapedOffer[]`
3. Each offer is passed to `saveOffer()`:
   - Look up the issuer by `issuer_slug`
   - Find the matching `credit_cards` row (exact name match → slug match → keyword fuzzy match → create stub)
   - Priority-aware save: if an offer with the same `(card_id, offer_type, headline)` exists:
     - If existing `source_priority ≤` incoming → only update `last_seen_at` (don't overwrite higher-trust data)
     - If existing `source_priority >` incoming → full overwrite with better data
   - `confidence_score` is computed and saved
4. `markStaleOffersInactive()` — marks any offer with `last_seen_at` older than 7 days as `is_active = false`
5. `logScrape()` — writes one row to `scrape_logs`

### Trust / Priority System

Offers have a `source_priority` (1–3) that determines whose data wins on conflicts. **Lower number = higher trust.**

| Priority | Meaning | Scrapers | Why |
|---|---|---|---|
| **1** | Richest / curated | `princeoftravel`, `churningcanada` | PoT visits every card page individually — it captures images, earn-rate multipliers, expiry dates, and full offer breakdowns. ChurningCanada is manually maintained by the community. Neither can be improved by overwriting with shallower data. |
| **2** | Bank-direct | `amex`, `td` | Straight from the issuer, so offer amounts are accurate. But the data is shallow (no images, no earn rates), so it should not overwrite PoT's richer rows. |
| **3** | Aggregator | `mintflying` | Third-party listings that aggregate offers from many sources — lower confidence. Never overwrites priority-1 or priority-2 content. |

**Rule:** A higher-priority (lower number) source will **always** perform a full overwrite when it encounters an existing lower-priority row. A lower-priority source will only refresh `last_seen_at` and `confidence_score` — it never touches the offer content.

**Example flow:**
1. `mintflying` (3) runs first → inserts "80,000 Amex MR points" at priority 3
2. `princeoftravel` (1) runs next → same headline exists at priority 3 → `3 > 1` → **full overwrite** with richer PoT data
3. `amex` (2) runs → same headline now exists at priority 1 → `1 ≤ 2` → **heartbeat only**, amex data is discarded

### Confidence Score (0–100)

Computed automatically at save time:

| Factor | Points |
|---|---|
| `is_verified = true` | +40 |
| `source_priority = 1` | +30 |
| `source_priority = 2` | +15 |
| `source_priority ≥ 3` | +5 |
| `last_seen_at` < 24 hours ago | +30 |
| `last_seen_at` < 72 hours ago | +20 |
| `last_seen_at` < 7 days ago | +10 |
| `last_seen_at` ≥ 7 days ago | +0 |

A freshly scraped, verified bank-direct offer scores **100** (40 + 30 + 30).

### Stale Offer Expiry

After every scraper run, `markStaleOffersInactive()` sets `is_active = false` on any offer where `last_seen_at < now - 7 days`. This means offers that disappear from the source are automatically hidden within 7 days.

### Scraper Inventory

**Active scrapers (5):**

| Scraper | File | Priority | Verified | Offers | Notes |
|---|---|---|---|---|---|
| `princeoftravel` | `scrapers/aggregators.ts` | **1** | ✅ | ~97 | Visits all 102 card pages — saves images, earn rates, expiry dates |
| `churningcanada` | `scrapers/churningcanada.ts` | **1** | ✅ | ~33 | SHA-gated GitHub README parser |
| `amex` | `scrapers/amex.ts` | 2 | ✅ | ~6 | Bank-direct — accurate offer amounts, shallow data |
| `td` | `scrapers/td.ts` | 2 | ✅ | ~1 | Bank-direct — accurate offer amounts, shallow data |
| `mintflying` | `scrapers/aggregators.ts` | 3 | ❌ | ~65 | Aggregator — JSON-LD → RSC payload → keyword scan |

**Total: ~202 offers across 20 issuers.**

Prince of Travel is **priority 1 and the primary source for card images and earn-rate multipliers** — it visits every individual card page and writes `image_url` and `earn_rate_multipliers` back to `credit_cards` when those fields are currently NULL. Its richer offer rows can never be overwritten by bank-direct (2) or aggregator (3) scrapers.

**Inactive scraper files (kept for future use):**

| File | Contents |
|---|---|
| `scrapers/banks.ts` | Scotiabank, BMO, RBC, CIBC scrapers |
| `scrapers/mortgage-rates.ts` | Ratehub + BigBank mortgage rate scrapers |
| `scrapers/playwright-scraper.ts` | `PlaywrightScraper` base class (NationalBank + Tangerine scrapers removed) |

### SHA-Gating (ChurningCanada)

The churningcanada scraper checks the GitHub Commits API before fetching the README:

1. Fetches latest commit SHA for `README.md` via `GET https://api.github.com/repos/stnlykwk/canada-best-cc-offers/commits?path=README.md&per_page=1`
2. Reads the previously stored SHA from `scrape_logs` (row with `scraper_name = 'churningcanada-sha'`, SHA stored as `sha:{sha}` in `error_message`)
3. If SHAs match → skip scrape (returns 0/0 success in ~150ms)
4. If different or no prior SHA → full scrape → store new SHA

This keeps Vercel function costs low since the README changes infrequently.

### Adding a New Scraper

1. Create `scrapers/yourbank.ts` that extends `BaseScraper`:
   ```typescript
   export class YourBankScraper extends BaseScraper {
     name = 'yourbank'
     issuerSlug = 'yourbank-slug'
     protected sourcePriority = 1   // bank-direct
     protected isVerified = true

     async scrape(): Promise<ScrapedOffer[]> {
       const res = await this.fetchWithTimeout('https://yourbank.ca/credit-cards')
       // parse HTML, return ScrapedOffer[]
     }
   }
   ```
2. Add the issuer to `issuers` table (or add to the `INSERT INTO issuers` block in `schema.sql`)
3. Register in `scripts/run-scrapers.ts` — add to the `SCRAPERS` map and import at the top
4. Add `scrape:yourbank` to `package.json` scripts
5. Register in `app/api/scrape/route.ts` scrapers array

### Cron Schedule

Defined in `vercel.json`:
```json
{ "path": "/api/scrape", "schedule": "0 6 * * *" }
```
Runs daily at **06:00 UTC** (02:00 Eastern). Vercel calls GET; the GET handler forwards to POST.

---

## 8. Data Quality Notes

The frontend must handle these cases gracefully:

### Null `image_url`

Many stub cards created by scrapers have no image. Always provide a fallback:

```tsx
<img
  src={card.image_url ?? '/images/cards/placeholder.png'}
  alt={card.name}
/>
```

### Points vs Cashback offers

`points_value` and `cashback_value` are mutually exclusive. Never expect both to be set:

```tsx
const valueDisplay = offer.points_value
  ? `${offer.points_value.toLocaleString()} points`
  : offer.cashback_value
    ? `${offer.cashback_value}% cash back`
    : 'Bonus offer'
```

`cashback_value` is a **percentage** (e.g. `10.0` = 10%), not a dollar amount.

### Confidence Score Display

Use `confidence_score` to communicate offer reliability:

| Score | Meaning | Suggested UI |
|---|---|---|
| 70–100 | Verified, recently seen | Green badge: "Verified" |
| 40–69 | Aggregator-sourced or aging | Yellow badge: "Unverified" |
| 0–39 | Old or low-trust data | Grey / dimmed, consider hiding |

```tsx
const badge =
  score >= 70 ? { label: 'Verified', color: 'green' } :
  score >= 40 ? { label: 'Unverified', color: 'yellow' } :
               { label: 'Outdated', color: 'gray' }
```

### `source_priority` Meaning

| Value | Meaning | Scrapers |
|---|---|---|
| `1` | Richest / curated (most reliable) | `princeoftravel`, `churningcanada` |
| `2` | Bank-direct | `amex`, `td` |
| `3` | Third-party aggregator | `mintflying` |

Show a small disclaimer like "Source: Third-party aggregator" when `source_priority = 2`.

### `expires_at` Handling

Always check before displaying limited-time offers:

```tsx
const isExpired = offer.expires_at && new Date(offer.expires_at) < new Date()
if (isExpired) return null  // or show as expired
```

### Stub Cards

Scrapers occasionally create minimal stub cards for cards not yet in the seed data (missing `pros`, `cons`, `short_description`, etc.). Check for these before rendering a full card detail page:

```tsx
const isStub = !card.short_description && !card.earn_rate_base
```

---

## 9. Points Valuations — Dollar Value Calculation

Use `/api/valuations` to convert a raw points balance into a CAD dollar value:

```tsx
// Fetch valuations once and cache them
const { valuations } = await fetch('/api/valuations').then(r => r.json())

function pointsToCAD(points: number, program: string, tier: 'low' | 'mid' | 'high' = 'mid'): string {
  const val = valuations.find(v => v.program === program)
  if (!val) return ''
  const cpp = val[`cpp_${tier}`]  // cents per point
  const dollars = (points * cpp) / 100
  return `$${dollars.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// Examples:
// 70,000 Amex MR × 1.8 cpp = $1,260
pointsToCAD(70000, 'Amex MR', 'mid')  // "$1,260"

// 90,000 Aeroplan × 2.0 cpp = $1,800
pointsToCAD(90000, 'Aeroplan', 'mid')  // "$1,800"

// 60,000 Scene+ × 1.0 cpp = $600
pointsToCAD(60000, 'Scene+', 'mid')  // "$600"
```

**Recommended display pattern for card listings:**
```
70,000 Amex MR points  ≈ $1,260 value*
* Based on 1.8 cents per point (mid estimate)
```

**Which `cpp` tier to use:**
- `cpp_mid` — recommended for all primary displays
- `cpp_low` — use for conservative disclaimers
- `cpp_high` — use to show aspirational value (business class redemptions)

---

## 10. Card Images

### Where images live

Card images are stored at `/public/images/cards/{slug}.png` (or `.jpg`, `.webp`). They are served as static assets.

### Primary image source: Prince of Travel

The `princeoftravel` scraper visits every card page on princeoftravel.com and writes the scraped `image_url` back to `credit_cards.image_url` **when the field is currently NULL**. After running `npm run scrape:princeoftravel`, most cards will have an image URL pointing to the PoT CDN. Run `npm run download-images` to pull those URLs down to local `/public/images/cards/`.

### Fallback handling

Always use a placeholder when `image_url` is null or the file might not exist:

```tsx
const src = card.image_url ?? '/images/cards/placeholder.png'
```

### Downloading images

Run the download script to pull card images from scraped URLs:

```bash
npm run download-images
```

This script reads scraped `image_url` values from the database and downloads them to `/public/images/cards/`.

### Requesting new images

When a new card is added and has no image:
1. Find the official card image on the issuer's website
2. Download and save as `/public/images/cards/{card-slug}.png`
3. Update `image_url` in the database:
   ```sql
   UPDATE credit_cards SET image_url = '/images/cards/{slug}.png' WHERE slug = '{slug}';
   ```

---

## 11. Running Scrapers Manually

All scraper commands use `ts-node` and load `.env.local` automatically.

### Run all scrapers

```bash
npm run scrape
```

### Run a single scraper

```bash
npm run scrape:princeoftravel # Prince of Travel — priority 1, ~97 offers, images, earn rates (~8 min)
npm run scrape:churningcanada # r/churningcanada — priority 1, SHA-gated, ~33 offers
npm run scrape:amex           # American Express — priority 2, bank-direct, ~6 offers
npm run scrape:td             # TD Bank — priority 2, bank-direct, ~1 offer
npm run scrape:mintflying     # MintFlying — priority 3, aggregator, ~65 offers
```

### Seed the database (new setup)

```bash
# 1. Run schema in Supabase SQL editor (supabase/schema.sql)
# 2. Then run seed script:
DOTENV_CONFIG_PATH=.env.local ts-node -r dotenv/config scripts/seed-cards.ts
```

### Trigger production scrape manually

```bash
curl -X POST https://smartcardoffers.ca/api/scrape \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 12. Known Gaps and Future Improvements

### Not yet built

| Item | Priority | Notes |
|---|---|---|
| `/api/cards/[slug]/blog` | Medium | Related blog posts for a card page |
| `/api/issuers` | Low | List all issuers for filter UI |
| Double opt-in for newsletter | Medium | `is_confirmed` column exists but confirmation flow not wired |
| Admin dashboard | High | View scrape health, edit cards/offers, manage featured |
| Card comparison endpoint | Medium | Compare 2–3 cards side by side |
| Offer history / price tracking | Low | Track how offers change over time |
| Re-enable bank scrapers | Medium | Scotiabank, BMO, RBC, CIBC scrapers exist in `banks.ts` but are not registered — add back to `run-scrapers.ts` and `route.ts` when needed |
| Search endpoint | Medium | Full-text search across card names and offer headlines |
| Pagination total count | Medium | `/api/cards` and `/api/offers` return `count` as page count, not total rows. Add `?count=exact` to Supabase queries for true total. |

### Known data quality issues

| Issue | Impact | Workaround |
|---|---|---|
| Aggregator card names don't always match seeded names | Stub cards created | `ensureCard()` fuzzy matching handles most; seed data enriches stubs over time |
| `spend_timeframe_days` often null for aggregator offers | Missing in display | Fall back to showing just the spend amount without timeframe |
| `cashback_value` is a percentage, not a dollar amount | Calculation errors | See [Section 8](#8-data-quality-notes) |
| Prince of Travel scraper takes ~8 min | Long Vercel cron runtime | PoT visits 102 pages × 2s delay; the daily cron has a 10-min timeout — acceptable, but monitor |
| `blog_posts.content_mdx` not exposed via API | Can't render blog posts | Query Supabase directly with the public anon key for individual post content |

---

## 13. Frontend Developer Setup & Collaboration

---

### Local setup

**1. Clone the repo**

```bash
git clone https://github.com/ryansandhu/smart-card-offers.git
cd smart-card-offers
```

**2. Install dependencies**

```bash
npm install
```

**3. Create your `.env.local` file**

Create a file called `.env.local` in the project root with the following variables. Ryan will send you these values directly — do not share them publicly.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> These two variables are all a frontend developer needs. The other variables (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `IP_HASH_SALT`) are backend-only — Ryan manages them.

**4. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app connects to the live Supabase database, so you'll see real card data immediately.

---

### Supabase access

**Getting access**

Ryan needs to invite you to the Supabase project. Once invited, you can view the database tables and schema in the Supabase dashboard (read-only access is sufficient for frontend work).

**Ryan — how to send the invite:**

1. Go to [supabase.com](https://supabase.com) and open the Smart Card Offers project
2. Click **Project Settings** (gear icon, bottom-left sidebar)
3. Click **Team** in the left menu
4. Click **Invite** and enter your cousin's email address
5. Set the role to **Developer**
6. Click **Send Invite**

Your cousin will receive an email to accept the invite and create a Supabase account.

**Which key to use in frontend code**

| Key | Use in frontend? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Safe — respects Row Level Security. All public API data is readable. |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Never | Bypasses all security. Backend use only. |

The `NEXT_PUBLIC_` prefix on the anon key means Next.js will automatically include it in browser bundles — this is intentional and safe. Never add `NEXT_PUBLIC_` to the service role key.

---

### How collaboration works

**Ownership split**

| Area | Owner | Folders / Files |
|---|---|---|
| Backend | Ryan | `app/api/`, `lib/`, `scrapers/`, `scripts/`, `types/`, `supabase/` |
| Frontend | Cousin | `app/page.tsx`, `app/**/page.tsx`, `app/**/layout.tsx`, any new `components/` folder |

**The rule: don't edit each other's folders.**

- Ryan does not touch frontend pages or components.
- Cousin does not touch API routes, scrapers, lib, or types.
- This keeps git merges clean and avoids stepping on each other.

**If you need something from the backend** (a new API field, a new endpoint, a schema change) — ask Ryan to add it. Don't reach into `lib/supabase.ts` or API routes directly.

---

### Daily workflow for the frontend developer

**Before starting work each day — pull latest changes:**

```bash
git pull origin main
```

This is important. Ryan may have pushed backend changes overnight (new API fields, schema updates) that your frontend code depends on.

**Making and pushing frontend changes:**

```bash
# Stage your changed files
git add app/page.tsx app/components/CardList.tsx   # list specific files

# Commit with a clear message
git commit -m "Add card listing page with filters"

# Push to GitHub
git push origin main
```

Vercel automatically deploys every push to `main`. Your changes go live within ~60 seconds of pushing.

**Never force-push:**

```bash
# Don't do this — it can overwrite Ryan's backend commits
git push --force origin main
```

If you get a "rejected" error on push, run `git pull origin main` first to merge in any new backend changes, then push again.

---

### Calling the API from frontend code

All data comes from the API routes documented in [Section 5](#5-api-endpoints). You do not need to query Supabase directly from the frontend — just fetch from the API.

**Example: fetch and display cards**

```tsx
// app/page.tsx or any Server Component
async function getCards() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/cards?limit=20`, {
    next: { revalidate: 3600 },  // cache for 1 hour
  })
  return res.json()
}

export default async function HomePage() {
  const { cards } = await getCards()
  return (
    <main>
      {cards.map(card => (
        <div key={card.id}>
          <img src={card.image_url ?? '/images/cards/placeholder.png'} alt={card.name} />
          <h2>{card.name}</h2>
          <p>{card.current_offer?.[0]?.headline}</p>
        </div>
      ))}
    </main>
  )
}
```

**Key things to remember when building the frontend:**

- `image_url` can be `null` — always show a placeholder (see [Section 10](#10-card-images))
- `points_value` and `cashback_value` are mutually exclusive — check which one is set (see [Section 8](#8-data-quality-notes))
- Use `confidence_score` to show verified vs unverified badges (see [Section 8](#8-data-quality-notes))
- Use `cpp_mid` from `/api/valuations` to show "≈ $X value" next to point amounts (see [Section 9](#9-points-valuations--dollar-value-calculation))
- Track apply clicks by calling `POST /api/track-click` before redirecting to the card's apply URL (see [Section 5](#5-api-endpoints))

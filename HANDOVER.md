# Smart Card Offers — Backend Handover Document

> Last updated: 2026-04-17 (migrations 011–046: slug fixes, logos, tags, content, scraper cleanup, cross-validation, review queue, duplicate card merge, dashboard improvements, final audit cleanup, monthly bonus fields, scraper safety hardening, offer archival on approve, priority inversion fix, source_name tracking, referral URL, offer review queue polish, FX/income fields, interest rates, card detail tables — insurance, earn rates, transfer partners, credits, lounge access; Phase 2 tables populated, offer system fixes, admin UI improvements)
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
│   ├── churningcanada.ts           r/churningcanada GitHub README (active, p1)
│   ├── aggregators.ts              PrinceOfTravel (p2) + MintFlying (p4) (active)
│   ├── banks.ts                    Scotiabank, BMO, RBC, CIBC (DELETED — p3 bank-direct removed)
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

### `GET /api/cards/compare`

Returns 2–3 cards side-by-side with their best active offer. Used to power comparison UI.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `slugs` | Yes | Comma-separated list of 2–3 card slugs |

**Errors:**
- `400` — fewer than 2 or more than 3 slugs provided
- `404` — any slug not found or inactive

**Example call:**
```
GET /api/cards/compare?slugs=amex-cobalt,td-aeroplan-visa-infinite,rbc-avion-visa-infinite
```

**Example response:**
```json
{
  "cards": [
    {
      "id": "uuid",
      "name": "American Express Cobalt Card",
      "slug": "amex-cobalt",
      "image_url": "https://nlfaxenxsxtmlaawputs.supabase.co/storage/v1/object/public/card-images/amex-cobalt.png",
      "referral_url": null,
      "annual_fee": 155.88,
      "rewards_type": "points",
      "rewards_program": "Amex MR",
      "earn_rate_base": 1.0,
      "earn_rate_multipliers": { "dining": 5, "groceries": 5 },
      "lounge_access": false,
      "travel_insurance": true,
      "tier": "entry",
      "issuer": { "name": "American Express", "slug": "amex" },
      "best_offer": {
        "offer_type": "welcome_bonus",
        "headline": "22,000 Amex MR points...",
        "points_value": 22000,
        "cashback_value": null,
        "spend_requirement": 750,
        "spend_timeframe_days": 360,
        "is_limited_time": false,
        "is_better_than_usual": false
      }
    }
  ]
}
```

**Notes:**
- Cards are returned in the same order as the `slugs` param.
- `best_offer` is the single highest-value active offer per card (highest `points_value` for points/hybrid; highest `cashback_value` for cashback). `null` if no active offers.
- `is_better_than_usual` is derived from the `offer_history_stats` view — `true` when the current value exceeds the 12-month average for that card/offer type.
- `referral_url` is always present (may be `null`).

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

One row per unique (card, offer_type, headline) combination. Multiple rows with the same `offer_type` on a single card are now allowed — both active and pending rows may coexist.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `card_id` | UUID | FK → credit_cards |
| `offer_type` | TEXT | `welcome_bonus`, `additional_offer`, `referral` |
| `headline` | TEXT | Human-readable offer summary |
| `details` | TEXT | Full description |
| `points_value` | INTEGER | Raw points offered. Null for cashback. |
| `cashback_value` | NUMERIC | Cashback as a percentage (e.g. `10.0` = 10%). Null for points. |
| `spend_requirement` | NUMERIC | Minimum spend to qualify (CAD) |
| `spend_timeframe_days` | INTEGER | Days to meet spend requirement |
| `start_month` | INTEGER | Month (1–12) after approval when the bonus period begins. `12` = anniversary date. See [Section 8](#8-data-quality-notes). |
| `is_monthly_bonus` | BOOLEAN | True if the offer has a monthly recurring component |
| `monthly_points_value` | INTEGER | Points earned per qualifying month |
| `monthly_cashback_value` | NUMERIC | Cashback earned per qualifying month (%) |
| `monthly_spend_requirement` | NUMERIC | Spend required each month to earn the monthly bonus |
| `bonus_months` | INTEGER | Number of qualifying months |
| `extra_perks` | TEXT[] | e.g. `["First year fee waived", "Priority Pass"]` |
| `is_limited_time` | BOOLEAN | True if the offer has an expiry |
| `expires_at` | DATE | Offer expiry date |
| `is_verified` | BOOLEAN | Manually or source-verified |
| `source_url` | TEXT | Where the offer was found |
| `source_name` | TEXT | Scraper identifier: `churningcanada`, `princeoftravel`, `mintflying`, `manual` |
| `source_priority` | INTEGER | **0** = manual, **1** = churningcanada, **2** = princeoftravel, **4** = mintflying |
| `scraped_at` | TIMESTAMPTZ | When the scraper last fetched it |
| `last_seen_at` | TIMESTAMPTZ | Last time this offer appeared in a scrape run |
| `confidence_score` | INTEGER | 0–100 computed score (see trust system) |
| `is_active` | BOOLEAN | True = shown to users. Set to false if not seen in 7+ days, or manually deactivated. |
| `review_status` | TEXT | `pending_review`, `approved`, `rejected`, `archived` |
| `review_reason` | TEXT | Why offer entered review: `new_card`, `new_offer`, `higher_bonus`, `updated_terms`, `lower_priority_source` |
| `content_source` | TEXT | Origin of headline/description: `manual`, `ai_generated`, `scraper`, or NULL |
| `is_better_than_usual` | BOOLEAN | True when current value exceeds 12-month average (from `offer_history_stats` view) |

**RLS:** Public read where `is_active = true AND review_status = 'approved'`. Writes require service role.

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
| **1** | Community curated | `churningcanada` | Manually maintained GitHub README — very high signal. |
| **2** | Rich editorial | `princeoftravel` | Visits every card page individually — captures images, earn-rate multipliers, expiry dates, full offer breakdowns. |
| **3** | Bank-direct | *(deleted)* | `amex.ts`, `td.ts`, `banks.ts` removed — p3 data was lower quality and caused merge conflicts with p1/p2 rows. |
| **4** | Aggregator | `mintflying` | Third-party listings — lower confidence. Never overwrites p1/p2 content. |

**Rule:** A higher-priority (lower number) source will **always** perform a full overwrite when it encounters an existing lower-priority row. A lower-priority source will only refresh `last_seen_at` and `confidence_score` — it never touches the offer content.

**Example flow:**
1. `mintflying` (4) runs first → inserts "80,000 Amex MR points" at priority 4
2. `princeoftravel` (2) runs next → same headline exists at priority 4 → `4 > 2` → **full overwrite** with richer PoT data
3. `churningcanada` (1) runs → same headline now at priority 2 → `2 > 1` → **full overwrite** with community data
4. `mintflying` (4) runs again → priority 1 exists → `1 ≤ 4` → **heartbeat only**, mintflying data is discarded

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

**Active scrapers (3):**

| Scraper | File | Priority | Verified | Notes |
|---|---|---|---|---|
| `churningcanada` | `scrapers/churningcanada.ts` | **1** | ✅ | SHA-gated GitHub README parser — ~33 offers |
| `princeoftravel` | `scrapers/aggregators.ts` | **2** | ✅ | Visits all card pages — saves images, earn rates, expiry dates (~3 min) |
| `mintflying` | `scrapers/aggregators.ts` | **4** | ❌ | Aggregator — JSON-LD → RSC payload → keyword scan |

**Active offers: 126 across 3 sources** (as of migration 022, 2026-03-31).

Prince of Travel is **the primary source for card images and earn-rate multipliers** — it visits every individual card page and writes `image_url` and `earn_rate_multipliers` back to `credit_cards` when those fields are currently NULL.

**Deleted scraper files (p3 bank-direct, removed 2026-03-30):**
`scrapers/amex.ts`, `scrapers/td.ts`, `scrapers/banks.ts` — p3 data was causing merge conflicts and wrong-program mismatches with p1/p2 rows. Offer data for Amex/TD cards is covered by ChurningCanada (p1) and PrinceOfTravel (p2).

**Inactive scraper files (kept for future use):**

| File | Contents |
|---|---|
| `scrapers/mortgage-rates.ts` | Ratehub + BigBank mortgage rate scrapers |
| `scrapers/playwright-scraper.ts` | `PlaywrightScraper` base class |

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
| `1` | Community curated (most reliable) | `churningcanada` |
| `2` | Rich editorial | `princeoftravel` |
| `4` | Third-party aggregator | `mintflying` |

Show a small disclaimer like "Source: Third-party aggregator" when `source_priority = 4`.

### `expires_at` Handling

Always check before displaying limited-time offers:

```tsx
const isExpired = offer.expires_at && new Date(offer.expires_at) < new Date()
if (isExpired) return null  // or show as expired
```

### `start_month` Display

`start_month` is an integer (1–12) representing which month after card approval the bonus period begins.

```tsx
function formatStartMonth(startMonth: number | null): string | null {
  if (!startMonth || startMonth === 1) return null          // no label needed
  if (startMonth === 12) return 'Starting at anniversary'   // special case
  return `Starting month ${startMonth}`
}
```

- `null` or `1` → no label needed (bonus starts immediately / first month)
- `12` → display as **"Starting at anniversary"** — do not display "Starting month 12"
- Any other value → display as "Starting month N"

---

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
npm run scrape:churningcanada  # r/churningcanada — priority 1, SHA-gated, ~33 offers (~5s)
npm run scrape:princeoftravel  # Prince of Travel — priority 2, images + earn rates (~3 min)
npm run scrape:mintflying      # MintFlying — priority 4, aggregator (~1 min)
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

## Current State (as of 2026-04-01)
- Migrations done: 011–028
- Active cards: 75 (down from 82, dupes merged)
- Inactive cards: 32 (kept — have historical offers attached)
- Active offers: 53

## What was done this session

### Data cleanup
- Migration 027: merged Scotia Platinum Amex, Amex Biz Platinum, Amex Green + fixed BMO eclipse sponsored slug
- Migration 028: merged CIBC Aventura Gold, RBC Avion Platinum, TD Platinum Travel, Amex Gold Rewards + fixed 4 stale scraper alias entries (critical — prevented dupes respawning on next scrape)
- Deleted 16 inactive cards with zero offers (clean orphan removal)
- Wiped 74 junk PoT extra_perks rows (HTML table artifacts)

### Public homepage (app/page.tsx)
- Built from scratch — was a stub
- 3-column offer display: Welcome Bonus | Additional Offer | Total
- Value formatting: "60,000 pts" / "2% cash back" in all 3 columns
- FYF badge shown on card name when extra_perks has 'First year annual fee waived'

### Admin UI improvements
- /admin/cards: Add Card form (name, issuer, network, tier, rewards_type, referral_url)
- /admin/cards: Reactivate + Delete buttons per card row
- /admin/offers: Add Offer form (card selector, all fields, source auto-sets priority)
- /admin/offers: offer_type now editable select in EditRow
- /admin/offers: spend_requirement now editable in EditRow
- /admin/offers: offer_type label more visible (gray-500)

### Scraper improvements
- Added additional_offer as valid offer_type in scraper-base.ts
- Near-dupe detection in ensureCard(): warns + flags pending_review if
  incoming card name shares 2+ significant words with an existing active card

### Third wave (2026-04-01)
- Redirected app root to /admin — repo is now admin-only
- Public API routes confirmed and documented (13 routes for cousin's frontend)
- FYF badge added to /admin/cards view rows
- Tier legend added to /admin/cards toolbar
- image_url field added to edit and add card forms with thumbnail preview
- Dashboard force-dynamic confirmed — count discrepancy was browser cache

### Second half of session (2026-04-01)
- Audited 215 inactive offers — confirmed 194 are legitimate historical records, not junk
- Deleted 15 $undefined headline rows (scraper validation gap fixed)
- Fixed 2 rejected-but-active offer inconsistencies
- Added image_url field to /admin/cards (edit + add card forms, thumbnail preview in view row)
- Dashboard math confirmed correct — count will drop on next load as DB is now clean
- Schema drift noted: image_url exists in live DB but not in any migration file

## Next Session TODO
1. Run all 3 scrapers from /admin/scrapers
2. Review pending offers in /admin/review
3. Add referral URLs per card in /admin/cards
4. Add FYF detection to PrinceOfTravel scraper (aggregators.ts)
5. Consider: second source cross-validation for top 10 cards
6. Future: monetization via referral/affiliate URLs

Then run:
git add -A && git commit -m "session: dupe merges, public homepage, admin add card/offer, FYF badge, dupe detection" && git push

---

## Session 2026-04-06

### Priority 1 — All items completed this session

**Monthly cashback field (migration 035)**
- Added `monthly_cashback_value NUMERIC(8,2)` column to `card_offers`
- Wired through admin UI (ReviewQueue, OffersTable), all admin page selects, and all public API selects
- Dashboard zero-value detection updated to exempt monthly recurring offers that have monthly values set

**Review queue safety hardening**
- `createCard`: now defaults `is_active: false` — new cards start inactive and must go through review
- `createOffer` (actions.ts): now defaults `is_active: false`, `review_status: 'pending_review'` — all new offers route through review regardless of creation path
- OffersTable and ReviewQueue: all manual create paths updated to match; all `source_priority: 9` → `source_priority: 0` (manual = highest trust, never overwritable by any scraper)
- `sendCardToReview` placeholder offer: `source_priority: 9` → `source_priority: 0`

**Scraper safety fixes**
- Heartbeat path (scraper-base.ts): removed code that conditionally set `is_active = true` on heartbeat updates — heartbeat now only touches `last_seen_at` and `confidence_score`, never activates offers
- ChurningCanada card reactivation: removed block that set `is_active: true` on cards that were previously deactivated; now logs a warning and skips instead

**Offer archival on approve**
- `approveOffer` in actions.ts: now fetches the offer's `card_id` and `offer_type`, sets all currently-active same-type offers for that card to `is_active: false, review_status: 'archived'` before activating the new one
- New `review_status` value: `'archived'` (existing: `pending_review`, `approved`, `rejected`)

**Priority inversion fix**
- Manual offers were incorrectly set to `source_priority: 9` (lowest trust, overwritable by all scrapers)
- Corrected to `source_priority: 0` (highest trust, never overwritable)
- Priority system: 0=manual, 1=churningcanada, 2=princeoftravel, 4=mintflying

**MintFlying cashback parsing fix**
- `MintFlyingScraper.cardToOffer()` only extracted `points_value`; added regex for `$X cash back` / `$X cashback` patterns
- `cashback_value` now populated for cashback offers from MintFlying

**Public API monthly bonus fields**
- All 6 monthly bonus fields now included in every offer select: `is_monthly_bonus`, `monthly_points_value`, `monthly_spend_requirement`, `monthly_cashback_value`, `bonus_months`, `start_month`
- Updated in: `lib/supabase.ts` (getCards, searchCards), `app/api/cards/[slug]/route.ts`, `app/api/cards/compare/route.ts`
- Compare endpoint also now returns `has_no_bonus` on each card

---

### PrinceOfTravel scraper diagnosis (2026-04-06)

**Symptom:** PoT was logging `97 found / 0 updated` with `status: 'partial'`

**Root cause investigation:**
1. `KNOWN_ISSUER_SLUGS` was suspected — **ruled out**. Confirmed perfect 20/20 match with DB issuers (no gaps in either direction).
2. Remaining suspects (not yet fully resolved):
   - **Priority guard**: all 97 existing offers are at priority ≤ 2 (PoT is also priority 2), so `existing.source_priority <= incomingPriority` → heartbeat-only for every row → `records_updated = 0` is expected and correct behavior, not a bug
   - **HTTP errors on individual card page fetches**: `status: 'partial'` is set when any offer save throws; if PoT card pages are returning 4xx/5xx intermittently, the heartbeat still increments `records_found` but the error prevents `records_updated` from incrementing
   - **Conclusion**: 0 updated is expected (all rows at equal or higher priority); partial status is from transient HTTP errors on a handful of the 97 card pages. Monitor next scrape run for improvement.

---

### Priority 2 — Next up

In rough priority order:

1. **Card merge/dedup in review queue** — admin UI to merge two cards (move all offers from one card_id to another, delete the source card). Currently done manually via SQL.
2. **AI auto-generate descriptions** — use Claude API to generate `short_description`, `pros`, `cons`, `best_for` for stub cards that have offer data but no content fields
3. **Tier audit** — ~15 cards still have `tier: 'entry'` as default; audit against issuer annual fee to assign correct tier
4. **Data quality formula** — implement on dashboard: `round(active offers with spend_requirement NOT NULL AND details NOT NULL / all active offers × 100)`
5. **Dashboard offer count fix** — `/admin` counts all active offers but should show offers-per-card breakdown; currently one card with 3 offers inflates the count
6. **API offer grouping** — `/api/cards/:slug` returns `current_offers: []` (flat array); consider grouping by `offer_type` for cleaner frontend consumption
7. **FYF detection in PoT scraper** — parse "First year annual fee waived" from PoT extra_perks and write `annual_fee_waived_first_year: true` back to the card

**Note:** `SCO_MASTER_ACTION_LIST.md` was not found in the repo root or `/docs`. If it exists elsewhere, check git log. If it needs to be created, it should live at the repo root and track all planned work items across sessions.

### Known data quality issues

| Issue | Impact | Workaround |
|---|---|---|
| Aggregator card names don't always match seeded names | Stub cards created | `ensureCard()` fuzzy matching handles most; seed data enriches stubs over time |
| `spend_timeframe_days` often null for aggregator offers | Missing in display | Fall back to showing just the spend amount without timeframe |
| `cashback_value` is a percentage, not a dollar amount | Calculation errors | See [Section 8](#8-data-quality-notes) |
| Prince of Travel scraper takes ~2 min | Vercel cron runtime | PoT visits ~100 card pages; delay reduced to 0.5s + jitter 0.2–0.8s; fits in 300s |
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

---

## 14. Session Summary — 2026-03-26 (Migrations 011–018)

### Migrations Applied

| # | File | What Changed |
|---|------|-------------|
| 011 | `011_fix_slugs.sql` | Fixed 2 trailing-dash slugs: `national-bank-world-elite-mastercard`, `neo-world-mastercard` |
| 012 | `012_issuer_logos.sql` | Added `logo_url` to all 20 issuers via Clearbit CDN |
| 013 | `013_default_tags.sql` | Backfilled `tags = '{}'` for 102 null rows; set column default to `'{}'` |
| 014 | `014_manual_fixes.sql` | Added `apply_url` for 11 cards; renamed TD card; deactivated 3 cards; added MBNA offer |
| 015 | `015_fix_offer_values.sql` | Populated `points_value`/`cashback_value` for 129 offers; deactivated 41 junk offers |
| 016 | `016_rewards_program.sql` | Populated `rewards_program` for all 83 null cards across 25+ programs |
| 017 | _(script only)_ | AI-generated `short_description`, `pros`, `cons`, `tags` for all 93 active cards via `scripts/generate-card-content.ts` |
| 018 | `018_deactivate_no_offer_cards.sql` | Deactivated 15 active cards with zero active offers — 93 → **78 active cards** |

### Current Data State

- **78 active cards**, each with at least one active offer in `card_offers`
- **0 null values** on any critical field: `slug`, `name`, `apply_url`, `rewards_program`, `rewards_type`, `card_type`, `tier`, `short_description`, `pros`, `cons`, `tags`, `issuer_id`
- **All slugs clean** — no trailing dashes, no special characters, no duplicates
- **All 20 issuers** have `logo_url` set
- **All active offers** have either `points_value` or `cashback_value` set

### Cards Deactivated in Migration 018

The following 15 cards were set `is_active = false` (no active offers existed for them). Reactivate once offer data is sourced:

- Canadian Tire Triangle World Elite Mastercard
- MBNA True Line Mastercard
- National Bank® World Elite® Mastercard®
- Neo World Elite® Mastercard
- Neo World Mastercard®
- RBC Visa Classic Low Rate
- RBC Visa Platinum
- Rogers Red Mastercard
- Rogers Red World Elite Mastercard
- Scotia Momentum® Visa Infinite\* Card
- Scotiabank Momentum Mastercard
- Scotiabank Momentum Visa
- Scotiabank Value Visa Card
- TD Cash Back Visa Card
- TD Low Rate Visa Card

### Scripts Added

| Script | Purpose | Safe to rerun? |
|--------|---------|---------------|
| `scripts/generate-card-content.ts` | AI-generates `short_description`, `pros`, `cons`, `tags` for cards with null `short_description` | ✅ Yes — skips already-populated cards |
| `scripts/audit.ts` | Full data quality audit across `credit_cards`, `card_offers`, `issuers` | ✅ Yes — read-only |

### Remaining TODOs

1. **Manual referral URLs** — replace `apply_url` with own affiliate/referral links on high-value cards (`referral_url` column already exists in schema)
2. **Admin UI** — interface for editing card/offer content without touching the DB directly
3. **Offer description cleanup** — script to generate clean `details` summaries for sparse/scraped offer text; same pattern as `generate-card-content.ts`
- Track apply clicks by calling `POST /api/track-click` before redirecting to the card's apply URL (see [Section 5](#5-api-endpoints))

---

## 15. Session Summary — 2026-04-09 (Migrations 036–044)

### Overview

This session hardened the data pipeline (review queue filtering, scraper scheduling, logging cleanup), added five new card detail tables populated by the scrapers, and polished the public API to expose all new fields.

---

### Migrations Applied

| # | File | What Changed |
|---|------|-------------|
| 036 | `036_income_fields.sql` | Added `minimum_household_income INTEGER` to `credit_cards` (personal `min_income` already existed) |
| 037 | `037_review_reason.sql` | Added `review_reason TEXT` to `card_offers` — explains why an offer entered the review queue (`new_card`, `new_offer`, `higher_bonus`, `updated_terms`, `lower_priority_source`) |
| 038 | `038_content_source.sql` | Added `content_source TEXT` to both `credit_cards` and `card_offers` — tracks origin of headline/description: `manual`, `ai_generated`, `scraper`, or NULL |
| 039 | `039_card_insurance.sql` | New table `card_insurance (card_id, coverage_type, maximum, details, source_priority, scraped_at)` — unique on `(card_id, coverage_type)` |
| 040 | `040_card_earn_rates.sql` | New table `card_earn_rates (card_id, category, rate, rate_text, source_priority, scraped_at)` — unique on `(card_id, category)` |
| 041 | `041_card_transfer_partners.sql` | New table `card_transfer_partners (card_id, partner_name, transfer_ratio, transfer_time, alliance, best_for, source_priority, scraped_at)` — unique on `(card_id, partner_name)` |
| 042 | `042_card_credits.sql` | New table `card_credits (card_id, credit_type, amount, description, frequency, source_priority, scraped_at)` — unique on `(card_id, credit_type)` |
| 043 | `043_card_lounge_access.sql` | New table `card_lounge_access (card_id, network, visits_per_year, guest_policy, details, source_priority, scraped_at)` — unique on `(card_id, network)` |
| 044 | `044_interest_rates.sql` | Added `purchase_rate`, `cash_advance_rate`, `balance_transfer_rate NUMERIC(5,2)` to `credit_cards` |

All five new tables have RLS enabled with a public SELECT policy so the API can read them via the anon key.

---

### Scraper Changes

**Priority hierarchy (final):**

| Priority | Scraper | Trust level |
|---|---|---|
| 1 | Prince of Travel | Highest — individual card pages, richest data |
| 2 | MintFlying | High — structured RSC JSON, verified data |
| 3 | ChurningCanada | Community — disabled (scraper exists, not running) |
| 4 | RateHub, others | Aggregator — lowest trust |

Lower number = higher trust. A higher-numbered source will never overwrite a lower-numbered source's content; it can only heartbeat (`last_seen_at`).

**PoT scraper now extracts and saves:**
- `card_insurance` — from "Insurance Coverage" table (COVERAGE / MAXIMUM / DETAILS)
- `card_earn_rates` — from "Earning Rewards" table (CATEGORY / RATE), preserving raw `rate_text`
- `card_transfer_partners` — from "Transfer Partners" table (PARTNER / RATIO / TRANSFER TIME)
- `credit_cards.purchase_rate`, `cash_advance_rate`, `balance_transfer_rate` — from "Interest Rates" section (null-guarded writes)

**MintFlying scraper now extracts and saves:**
- `card_earn_rates` — from `earnRates` RSC JSON field (priority-guarded; won't overwrite PoT data)
- `card_transfer_partners` — from `transferPartners` / `rewardPartners` RSC fields
- `card_credits` — from `travelCredits` / `credits` / `benefits` RSC fields
- `card_lounge_access` — from `loungeAccess` RSC field (handles boolean, string, or array)

**Priority guard for detail tables:** All five tables use a shared `priorityGuardedUpsert()` function in `lib/supabase.ts`. Before writing each row, it checks the existing `source_priority` for that `(card_id, key)` pair — only upserts if no existing row with a lower priority number exists. PoT (1) always wins over MintFlying (2).

**Scraper schedule changed to weekly:**
- Both `fast` and `deep` scrapers now run on **Sunday 06:00 UTC = Saturday 10:00 PM PST**
- Changed in `vercel.json`: `"0 6 * * *"` → `"0 6 * * 0"` (fast), `"0 7 * * 0"` (deep, staggered 1h)
- Manual "Run now" button in admin UI is unaffected

---

### Public API Changes

**Pending-review offers filtered from all public endpoints:**

All three public endpoints (`/api/cards`, `/api/cards/:slug`, `/api/offers`) now filter `card_offers` to `review_status = 'approved'` only. Previously only `is_active = true` was checked. This was the root cause of duplicate pending offers appearing on the frontend (the BMO Eclipse Visa Infinite Privilege showed two offers — one pending).

**Important for frontend developers:** You do NOT need to filter by `review_status` in the frontend. The API handles this. Only approved, active offers ever appear in API responses.

**Cards with only pending offers are excluded:** Because `review_status = 'approved'` is applied as a PostgREST inner-join filter on the nested `card_offers`, cards that have zero approved offers are excluded from `/api/cards` results entirely.

**New nested arrays on all card responses:**

All card endpoints (`/api/cards`, `/api/cards/:slug`, `/api/offers` card objects) now include:

```json
{
  "insurance": [
    { "coverage_type": "Travel Medical", "maximum": "$5,000,000", "details": "Up to 15 days per trip" }
  ],
  "earn_rates": [
    { "category": "Groceries", "rate": 3.0, "rate_text": "3 points per $1" },
    { "category": "All other purchases", "rate": 1.0, "rate_text": "1 point per $1" }
  ],
  "transfer_partners": [
    { "partner_name": "Air Canada Aeroplan", "transfer_ratio": "1:1", "transfer_time": "Instant", "alliance": null, "best_for": null }
  ],
  "credits": [
    { "credit_type": "travel_credit", "amount": 100.00, "description": "$100 travel credit annually", "frequency": "annual" }
  ],
  "lounge_access": [
    { "network": "Priority Pass", "visits_per_year": null, "guest_policy": "2 free guests per visit", "details": null }
  ]
}
```

All five arrays will be empty (`[]`) for cards that haven't been scraped yet. Treat them as nullable arrays on the frontend.

**New offer fields now included in responses:**
- `review_reason` — why the offer was flagged for review (informational; always null for approved offers in practice)
- `content_source` — origin of the headline: `manual`, `ai_generated`, `scraper`, or null

**New card-level fields now populated by scrapers:**
- `foreign_transaction_fee` — `NUMERIC(5,2)`, e.g. `2.5` for 2.5%, `0` for no FX fee
- `min_income` — personal minimum income in CAD (integer)
- `minimum_household_income` — household minimum income in CAD (integer)
- `purchase_rate`, `cash_advance_rate`, `balance_transfer_rate` — APRs as percentages (e.g. `20.99`)

---

### Admin & Dashboard Changes

**Review queue improvements:**
- `review_reason` badges shown per offer (`new_card`, `new_offer`, `higher_bonus`, `updated_terms`, `lower_priority_source`)
- Merge flow with side-by-side offer comparison before approving
- Activate conflict warnings when approving an offer that would conflict with an existing active offer

**Dashboard offer counts:**
- Active offer count now shows: "X cards with offers / Y total offers" (previously just total offer count)
- "Cards needing attention" section now distinguishes: "no active offers" vs "offers pending review" — different action required for each

**Debug logging cleaned up:**
- Removed non-error `console.log` calls from application code (kept all API error catches and scraper operational logging)
- All `scripts/*.ts` files retain console output — they are CLI tools where output is intentional

**AI content generation:**
- `scripts/ai-generate-content.ts` added — generates `short_description` for cards and polishes `headline` for offers
- `content_source` field tracks whether content is `manual`, `ai_generated`, or `scraper`-origin — AI script never overwrites `manual` content

---

### Architecture Notes

**`lib/supabase.ts` — new exports:**
- `upsertCardInsurance(cardId, rows, sourcePriority)`
- `upsertCardEarnRates(cardId, rows, sourcePriority)`
- `upsertCardTransferPartners(cardId, rows, sourcePriority)`
- `upsertCardCredits(cardId, rows, sourcePriority)`
- `upsertCardLoungeAccess(cardId, rows, sourcePriority)`

All five share a single `priorityGuardedUpsert<T>()` generic helper.

**`lib/scraper-base.ts` — extended save pipeline:**
Extended data writes run in `saveOffer()` immediately after `card_id` is resolved — before offer validation. This means insurance/earn-rate data is saved even when the offer itself is skipped (e.g. no bonus value, headline too short). The writes happen via the five new upsert helpers above.

**`types/index.ts` — `ScrapedOffer` additions:**
```ts
insurance_rows?:        Array<{ coverage_type, maximum?, details? }>
earn_rate_rows?:        Array<{ category, rate, rate_text }>
transfer_partner_rows?: Array<{ partner_name, transfer_ratio?, transfer_time?, alliance?, best_for? }>
credit_rows?:           Array<{ credit_type, amount?, description?, frequency? }>
lounge_access_rows?:    Array<{ network, visits_per_year?, guest_policy?, details? }>
card_purchase_rate?:    number
card_cash_advance_rate?: number
card_balance_transfer_rate?: number
```

---

### Remaining TODOs

1. ~~**Populate detail tables**~~ — ✅ Done (session 2026-04-15/17, see Section 16)
2. **Frontend integration** — surface the new nested arrays (insurance, earn rates, transfer partners, credits, lounge access) in the card detail page UI
3. **ChurningCanada re-enable** — scraper is written and working but disabled; re-enable once data quality is confirmed
4. **Tier boundaries** — corrected in this session; verify the UI tier filter labels match the updated ranges

---

## 16. Session Summary — 2026-04-15/17 (Migrations 045–046)

### Phase 2 Detail Tables — Now Populated

The PoT scraper was run manually to seed the five detail tables for the first time.

| Table | Rows | Populated columns |
|---|---|---|
| `card_insurance` | **440** | `coverage_type`, `maximum`, `details` |
| `card_earn_rates` | **200** | `category`, `rate` (numeric), `rate_text` (raw string e.g. "3x on groceries") |
| `card_transfer_partners` | **80** | `partner_name`, `transfer_ratio`, `transfer_time` |
| `card_credits` | **0** | Populated by MintFlying — not yet run |
| `card_lounge_access` | **0** | Populated by MintFlying — not yet run |

MintFlying needs to be run to seed `card_lounge_access`. **`card_credits` cannot be populated from MintFlying** — MintFlying has no structured credits data. The `pros` array is unstructured prose only (e.g. "$100 NEXUS credit", "4th night free on Aeroplan hotel redemptions"). `card_credits` for MintFlying cards requires manual entry.

**MintFlying lounge extraction (updated 2026-04-17)**

The scraper now parses `loungeDetails` (semicolon-delimited string) instead of emitting a generic `{ network: 'Lounge Access' }` row. Parsing rules:
- Split on `";"` — each clause is one lounge program
- `"Maple Leaf"` in clause → `network = 'Air Canada Maple Leaf Lounge'`
- `"Priority Pass"` in clause → `network = 'Priority Pass'`
- `/plus 1 guest|\+?\s*1 guest/i` in clause → `guest_policy = '1 guest included'`
- `visits_per_year` is always left `undefined` (type is `number | undefined`; unlimited and pay-per-entry are both stored as omitted)
- Full clause stored as `details`
- Fallback when `loungeDetails` is absent but `loungeAccess === true`: `{ network: 'Lounge Access' }`

---

### Offer System Fixes

**Migration 045 — Drop welcome_bonus unique index**

The partial unique index `card_offers_welcome_unique` (one `welcome_bonus` row per `card_id`) was dropped. Multiple active offers of the same type are now allowed per card at both the DB and application level.

**`approveOffer()` — archive step removed (`app/admin/actions.ts`)**

Previously, approving a new offer archived all other active offers of the same type for that card. This step has been removed. Approving an offer now only activates that single offer; existing active offers are untouched.

**Scraper no longer overwrites active rows (`lib/scraper-base.ts`)**

Root cause identified: when a scraper detected a changed offer, it updated the existing `card_offers` row in-place — stamping `is_active: false` even when the row was the live, user-visible offer. This displaced 28 active offers.

Fix: when the existing row is `is_active: true`, the scraper now **inserts a new pending row** alongside the active one. The active offer stays live until an admin reviews and approves the pending one. Only when the existing row is already inactive/pending does the scraper overwrite in-place.

The lookup was also changed from `.maybeSingle()` to `.order('is_active', asc).limit(1)` so that if both an active and a pending row exist, subsequent scrapes find and update the pending row rather than stacking another pending row on top.

**Migration 046 — Recovery script (run manually in Supabase SQL editor)**

```sql
UPDATE public.card_offers
SET is_active = true, review_status = 'approved'
WHERE review_status = 'pending_review'
  AND NOT EXISTS (
    SELECT 1 FROM public.card_offers co2
    WHERE co2.card_id    = card_offers.card_id
      AND co2.offer_type = card_offers.offer_type
      AND co2.is_active  = true
      AND co2.id        != card_offers.id
  );
```

This promotes pending offers that have no active sibling back to `is_active: true`. Idempotent — safe to re-run.

---

### Admin UI Improvements

**Review queue — expandable current offer (`app/admin/review/ReviewQueue.tsx`)**

The static "current" label on active offer rows in the review queue is now a clickable toggle (`current ▾ / ▴`). Clicking it expands a read-only green panel showing full offer details: Headline, Points, Cashback, Spend Req, Timeframe, monthly bonus fields, Expires, Source. Card `short_description` is shown at the top when present. Helps admins compare the live offer against the incoming pending one before deciding to approve or trash.

**Card edit panel — inactive offer history (`app/admin/offers/OffersTable.tsx`)**

A collapsible "Inactive Offers (N)" section has been added at the bottom of each card's edit panel in `/admin/offers`. It shows a read-only table of all historical inactive offers for that card: Type, Points, Spend Req, Source, Status, Date. Collapsed by default; hidden entirely if no inactive offers exist. `scraped_at` and `review_status` are now included in the offers query.

---

### Migrations Applied

| # | File | What Changed |
|---|---|---|
| 045 | `045_drop_welcome_bonus_unique.sql` | Dropped `card_offers_welcome_unique` partial index — allows multiple active offers of the same type per card |
| 046 | `046_recover_displaced_offers.sql` | One-time recovery: promotes displaced `pending_review` offers with no active sibling to `is_active: true` — **run manually in Supabase SQL editor** |

---

---

### API Connection Fix — Column Name Corrections (2026-04-17)

**Root cause of "API not connecting":** Three public endpoints (`/api/cards`, `/api/cards/:slug`, `/api/offers`) were requesting non-existent column names in their PostgREST select strings for the Phase 2 detail tables. PostgREST returns an error (400 Bad Request) when any selected column does not exist, which caused the entire query to fail and the API to return 500.

**Wrong column names used in queries (now fixed):**

| Table | Wrong name used | Correct DB column name |
|---|---|---|
| `card_earn_rates` | `rate_multiplier` | `rate` (NUMERIC) |
| `card_earn_rates` | `details` | `rate_text` (TEXT — raw string e.g. "3x on groceries") |
| `card_transfer_partners` | `ratio` | `transfer_ratio` (TEXT) |

**Files fixed:**
- `lib/supabase.ts` — `getCards()` and `searchCards()`: `earn_rates` and `transfer_partners` select strings corrected; `EarnRateRow` and `TransferPartnerRow` internal types corrected
- `app/api/cards/[slug]/route.ts` — same select string fix
- `types/index.ts` — `ScrapedOffer.earn_rate_rows` and `transfer_partner_rows` field names corrected
- `scrapers/aggregators.ts` — all four `earn_rate_rows.push()` calls updated to use `rate`/`rate_text`; all three `transfer_partner_rows.push()` calls updated to use `transfer_ratio`

**Unchanged (already correct):** `getActiveOffers()` in `lib/supabase.ts` already used the correct column names.

**Other confirmed correct facts:**
- `card_offers` offer value columns: `points_value` (INTEGER), `cashback_value` (NUMERIC) — these were always correct
- `start_month = 12` means anniversary date — display as "Starting at anniversary" (see Section 8)
- Multiple active offers per card are now allowed (migration 045 dropped the `welcome_bonus` unique index)
- Scraper now inserts a new pending row alongside an active one (never overwrites active rows in-place)
- Priority system: 0=manual (never overwritable), 1=churningcanada, 2=princeoftravel, 4=mintflying
- DB counts as of 2026-04-17: `card_insurance`=440 rows, `card_earn_rates`=200 rows, `card_transfer_partners`=80 rows

---

### Remaining TODOs

1. **Run migration 046** in Supabase SQL editor to restore 28 displaced offers to active
2. **Run MintFlying scraper** to populate `card_credits` and `card_lounge_access`
3. **Frontend integration** — surface detail table arrays (insurance, earn rates, transfer partners, credits, lounge) in the card detail page UI
4. **`start_month` display** — implement display logic in frontend (see Section 8)

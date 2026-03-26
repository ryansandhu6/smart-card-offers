# Smart Card Offers — Frontend Handover

Everything you need to build the UI. No backend knowledge required.

---

## Quick start

All data comes from the API routes below — you never query Supabase directly from the frontend. The base URL in production is `https://smart-card-offers.vercel.app`. In local dev, `http://localhost:3000`.

```ts
// Use this pattern for all API calls in Server Components
const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/cards`, {
  next: { revalidate: 3600 }, // cache 1 hour
})
const { cards } = await res.json()
```

CORS is open (`*`) — all origins are allowed.

---

## Critical gotchas — read before you write a single component

These will cause bugs if you don't know them upfront.

### 1. `current_offers` is always an array, never a single object
Both `/api/cards` and `/api/cards/:slug` return `current_offers: CardOffer[]`. A card can have multiple active offers (e.g. a welcome bonus AND a limited-time elevated offer running simultaneously). Always treat it as an array. Most cards have 1–3 offers; some have 0.

```ts
// ✅ correct
const bestOffer = card.current_offers?.[0]

// ❌ wrong — will crash if there are multiple offers or none
const { points_value } = card.current_offer
```

### 2. Several fields are nullable — always guard them

| Field | Where | Why it can be null |
|-------|-------|--------------------|
| `image_url` | cards | ~5% of cards have no image yet |
| `referral_url` | cards | Only set when there's an affiliate link |
| `apply_url` | cards | Set manually; may not exist on stub cards |
| `earn_rate_multipliers` | cards | Not scraped for all cards |
| `rewards_program` | cards | Some cards don't belong to a named program |
| `earn_rate_base` | cards | Not always set on stub cards |
| `expires_at` | offers | Most offers have no hard expiry |
| `details` | offers | Short headline is always present; long description is not |

Always have a fallback for `image_url`:

```tsx
<img src={card.image_url ?? '/images/card-placeholder.png'} alt={card.name} />
```

Never render an Apply button without a URL check:

```tsx
{(card.referral_url ?? card.apply_url) && (
  <a href={card.referral_url ?? card.apply_url}>Apply Now</a>
)}
```

### 3. `expires_at` is a date string, not a timestamp

It comes back as `"2025-12-31"` (YYYY-MM-DD), not an ISO timestamp. If you parse it with `new Date("2025-12-31")`, JavaScript treats it as **midnight UTC**, which means it may show as December 30 in North American timezones. Use this pattern:

```ts
// Safe: treat as end-of-day in display only, never rely on exact time
const expiresDate = offer.expires_at ? new Date(offer.expires_at + 'T23:59:59') : null
```

### 4. `is_better_than_usual` is unreliable for ~12 months

This flag compares the current offer against a 12-month rolling average from the `offer_history` table. Since the site is new, the history table is empty and this will return `false` for all offers for roughly the first year of operation. Use it as a soft badge only — don't hide offers or sort by it exclusively.

```tsx
{offer.is_better_than_usual && (
  <span className="badge">Elevated Offer</span>
)}
```

### 5. Points values are integers, cashback values are decimals

`points_value` is an `INTEGER` (e.g. `70000`). `cashback_value` is a `NUMERIC` returned as a string from Postgres (e.g. `"2.00"`). Always `parseFloat()` before doing math on cashback values.

```ts
const cashback = parseFloat(offer.cashback_value ?? '0')
```

### 6. Showing dollar value of points

Use `/api/valuations` to fetch CPP (cents per point) values per program. Multiply:

```ts
const dollarValue = (points_value / 100) * cpp_mid
// e.g. 70000 points × 1.8 cpp = $1,260 value
```

Match on `card.rewards_program` (e.g. `"Amex MR"`) to the `program` field in valuations.

---

## API Reference

### `GET /api/cards`

Card listing with filters. Use this for the main cards grid.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Cards per page (max 100) |
| `issuer` | string | — | Issuer slug, e.g. `amex`, `td`, `rbc` |
| `tier` | string | — | `no-fee`, `entry`, `mid`, `premium`, `super-premium` |
| `rewards_type` | string | — | `points`, `cashback`, `hybrid` |
| `tags` | string | — | Comma-separated, e.g. `travel,aeroplan` |
| `featured` | `true` | — | Return only featured cards |

**Response:**
```json
{
  "cards": [
    {
      "id": "uuid",
      "name": "American Express Cobalt Card",
      "slug": "amex-cobalt",
      "tier": "entry",
      "annual_fee": 155.88,
      "annual_fee_waived_first_year": false,
      "rewards_type": "points",
      "rewards_program": "Amex MR",
      "earn_rate_base": 1.0,
      "earn_rate_multipliers": { "dining": 5, "groceries": 5 },
      "lounge_access": false,
      "travel_insurance": true,
      "purchase_protection": true,
      "foreign_transaction_fee": 0,
      "image_url": "https://nlfaxenxsxtmlaawputs.supabase.co/storage/v1/object/public/card-images/amex-cobalt.png",
      "referral_url": null,
      "apply_url": "https://...",
      "is_featured": true,
      "tags": ["travel", "dining", "no-fx-fee"],
      "issuer": {
        "id": "uuid",
        "name": "American Express",
        "slug": "amex",
        "logo_url": null,
        "website": "https://www.americanexpress.com/ca"
      },
      "current_offers": [
        {
          "id": "uuid",
          "offer_type": "welcome_bonus",
          "headline": "22,000 Amex MR points",
          "points_value": 22000,
          "cashback_value": null,
          "spend_requirement": 750,
          "spend_timeframe_days": 360,
          "is_limited_time": false,
          "expires_at": null,
          "is_verified": true,
          "source_priority": 1,
          "confidence_score": 100,
          "last_seen_at": "2026-03-25T06:00:00Z"
        }
      ]
    }
  ],
  "count": 20,
  "total": 84
}
```

**Notes:**
- `count` = cards on this page. `total` = all matching cards in DB. Use `total` for pagination UI.
- Cards are sorted: featured first, then by `is_featured` descending.
- `current_offers` is filtered to active offers only — expired or stale offers are excluded.
- `earn_rate_multipliers` keys are standardised: `groceries`, `dining`, `gas`, `travel`, `transit`, `streaming`, `drugstore`, `foreign_currency`, `other`.

---

### `GET /api/cards/:slug`

Single card with full details. Use this for the card detail page.

**Example:** `GET /api/cards/amex-cobalt`

**Response:**
```json
{
  "card": {
    "id": "uuid",
    "name": "American Express Cobalt Card",
    "slug": "amex-cobalt",
    "short_description": "Best everyday earn rate in Canada for dining and groceries",
    "pros": ["5x on dining and groceries", "No FX fees"],
    "cons": ["Monthly fee structure ($12.99/mo)"],
    "best_for": ["dining", "travel", "beginners"],
    "min_income": null,
    "tier": "entry",
    "annual_fee": 155.88,
    "rewards_type": "points",
    "rewards_program": "Amex MR",
    "earn_rate_base": 1.0,
    "earn_rate_multipliers": { "dining": 5, "groceries": 5 },
    "transfer_partners": ["Air Canada Aeroplan", "British Airways"],
    "lounge_access": false,
    "travel_insurance": true,
    "purchase_protection": true,
    "foreign_transaction_fee": 0,
    "credit_score_min": "good",
    "image_url": "https://nlfaxenxsxtmlaawputs.supabase.co/...",
    "referral_url": null,
    "apply_url": "https://...",
    "issuer": { "id": "uuid", "name": "American Express", "slug": "amex" },
    "current_offers": [
      {
        "id": "uuid",
        "offer_type": "welcome_bonus",
        "headline": "22,000 Amex MR points",
        "details": "Earn 2,500 MR points for each billing period you spend $750...",
        "points_value": 22000,
        "cashback_value": null,
        "spend_requirement": 750,
        "spend_timeframe_days": 360,
        "extra_perks": ["No foreign transaction fees for the first year"],
        "is_limited_time": false,
        "expires_at": null,
        "is_verified": true,
        "source_priority": 1,
        "confidence_score": 100,
        "source_url": "https://princeoftravel.com/...",
        "scraped_at": "2026-03-25T06:00:00Z",
        "last_seen_at": "2026-03-25T06:00:00Z",
        "is_better_than_usual": false
      }
    ]
  }
}
```

**Notes:**
- This route includes `details`, `extra_perks`, `source_url`, `scraped_at` — not included in the list endpoint.
- `pros`, `cons`, `best_for` are string arrays — may be empty `[]` on stub cards.
- `transfer_partners` is a string array — may be `null`.
- `credit_score_min` is one of: `fair`, `good`, `very-good`, `excellent` — may be `null`.
- `min_income` is CAD dollars as an integer — may be `null`.

**404:** Returns `{ "error": "Card not found" }` if slug doesn't exist or card is inactive.

---

### `GET /api/cards/compare`

Side-by-side comparison of 2–3 cards. Use this for the comparison tool.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `slugs` | Yes | Comma-separated list of 2–3 card slugs |

**Example:** `GET /api/cards/compare?slugs=amex-cobalt,td-aeroplan-visa-infinite`

**Errors:**
- `400` — missing slugs, fewer than 2, more than 3, or duplicate slugs
- `404` — any slug not found or inactive

**Response:**
```json
{
  "cards": [
    {
      "id": "uuid",
      "name": "American Express Cobalt Card",
      "slug": "amex-cobalt",
      "image_url": "https://...",
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
        "headline": "22,000 Amex MR points",
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
- Cards are returned in the same order as the `slugs` param — safe to use for rendering columns.
- `best_offer` is `null` if the card has no active offers.
- `best_offer` is the single highest-value offer: highest `points_value` for points/hybrid cards, highest `cashback_value` for cashback cards.

---

### `GET /api/offers`

Paginated list of active offers across all cards, ranked by trust and value. Use this for a "Latest Offers" or "Hot Deals" feed.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Offers per page (max 100) |
| `limited` | `true` | — | Return only limited-time offers |

**Response:**
```json
{
  "offers": [
    {
      "id": "uuid",
      "card_id": "uuid",
      "offer_type": "welcome_bonus",
      "headline": "70,000 Aeroplan points",
      "points_value": 70000,
      "cashback_value": null,
      "spend_requirement": 5000,
      "spend_timeframe_days": 90,
      "is_limited_time": false,
      "expires_at": null,
      "is_verified": true,
      "source_priority": 1,
      "confidence_score": 100,
      "is_better_than_usual": false,
      "card": {
        "id": "uuid",
        "name": "TD Aeroplan Visa Infinite",
        "slug": "td-aeroplan-visa-infinite",
        "image_url": "https://...",
        "referral_url": null,
        "issuer": { "name": "TD", "slug": "td" }
      }
    }
  ],
  "count": 20,
  "total": 156,
  "page": 1,
  "limit": 20
}
```

**Notes:**
- `count` = offers on this page. `total` = all active offers in DB. Use `total` for pagination.
- Sorted by: source_priority ASC (bank-direct first), then points DESC, cashback DESC, confidence DESC.
- The nested `card` object includes the full card row plus its issuer — you have everything needed to render an offer card without a second request.

---

### `GET /api/cards/:slug/history`

Offer value history for a single card. Use this for a "historical bonus chart" component.

**Example:** `GET /api/cards/amex-cobalt/history`

**Response:**
```json
{
  "card": {
    "id": "uuid",
    "name": "American Express Cobalt Card",
    "slug": "amex-cobalt"
  },
  "history": [
    {
      "id": "uuid",
      "card_id": "uuid",
      "offer_type": "welcome_bonus",
      "headline": "30,000 Amex MR points",
      "points_value": 30000,
      "cashback_value": null,
      "spend_requirement": 3000,
      "spend_timeframe_days": 90,
      "source_priority": 1,
      "first_seen_at": "2026-02-01T00:00:00Z",
      "last_seen_at": "2026-03-01T00:00:00Z",
      "is_active": true,
      "created_at": "2026-02-01T00:00:00Z"
    }
  ],
  "stats": [
    {
      "card_id": "uuid",
      "offer_type": "welcome_bonus",
      "all_time_high_points": 30000,
      "avg_points_12mo": 25000,
      "all_time_high_cashback": null,
      "avg_cashback_12mo": null,
      "total_offers_seen": 4
    }
  ]
}
```

**Notes:**
- `history` is ordered newest-first (`first_seen_at DESC`).
- A new history row is only created when `points_value` or `cashback_value` changes — the same offer seen daily for a month creates only one row, not 30.
- `stats` will be empty for the first ~12 months since it's based on a 12-month rolling window. Don't show the history section until `history.length > 0`.
- `404` if the slug doesn't exist or is inactive.

---

### `GET /api/issuers`

List of all issuers that have at least one active card. Use this to populate issuer filter dropdowns.

**Response:**
```json
{
  "issuers": [
    {
      "id": "uuid",
      "name": "American Express",
      "slug": "amex",
      "logo_url": null,
      "website": "https://www.americanexpress.com/ca",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

**Notes:**
- Only returns issuers with at least one active card — no empty issuers.
- `logo_url` is `null` for all issuers currently (column exists, not populated).
- Sorted alphabetically by name.
- Pass `issuer.slug` as the `?issuer=` param to `/api/cards` to filter by issuer.

---

### `GET /api/valuations`

Points program valuations in cents per point (cpp). Use these to show "≈ $X value" next to point amounts.

**Response:**
```json
{
  "valuations": [
    {
      "program": "Amex MR",
      "cpp_low": 1.0,
      "cpp_mid": 1.8,
      "cpp_high": 2.5,
      "methodology": "Based on Air Canada business class transfer at 1:1"
    },
    {
      "program": "Aeroplan",
      "cpp_low": 1.2,
      "cpp_mid": 2.0,
      "cpp_high": 3.0,
      "methodology": "Based on partner redemptions; Star Alliance business class"
    }
  ],
  "count": 7
}
```

**Programs covered:** Amex MR, Aeroplan, Scene+, BMO Rewards, CIBC Aventura, RBC Avion, WestJet Dollars.

**How to use:**
```ts
// Show estimated dollar value of a welcome bonus
function pointsValue(points: number, program: string, valuations: Valuation[]) {
  const v = valuations.find(v => v.program === program)
  if (!v) return null
  return ((points / 100) * v.cpp_mid).toFixed(0)
}
// 70,000 Aeroplan × 2.0cpp = "$1,400 value"
```

**Notes:**
- Use `cpp_mid` for the primary displayed value.
- `cpp_low` and `cpp_high` can be used for a range display ("worth $840–$2,100").
- No pagination — always returns all rows (~7 programs). Fetch once and cache.

---

### `POST /api/newsletter`

Subscribe to the newsletter.

**Request body:**
```json
{
  "email": "user@example.com",
  "first_name": "Alex",
  "source": "homepage"
}
```

- `email` is required. `first_name` and `source` are optional.
- `source` should describe where the form was shown: `"homepage"`, `"card-page"`, `"blog"`, etc.

**Response:**
```json
{ "success": true, "email_sent": true }
```

- `success: true` means the email was saved to the DB — subscription succeeded.
- `email_sent` is a separate flag for whether the welcome email was delivered. It can be `false` even when `success` is `true` (Resend outage, etc.). Don't show an error to the user in this case — the subscription worked.

**Error responses:**
- `400` — `{ "error": "Invalid email" }` — missing `@`
- `500` — `{ "error": "Failed to save subscriber" }` — DB error

---

### `POST /api/track-click`

Log a referral click before redirecting the user to an apply/referral URL. Fire-and-forget — don't block the redirect on the response.

**Request body:**
```json
{
  "card_id": "uuid",
  "offer_id": "uuid",
  "source_page": "/cards/amex-cobalt"
}
```

All fields are optional. Include whatever context you have.

**Response:** `{ "success": true }`

**How to use:**
```ts
async function handleApplyClick(card: Card, offer: Offer) {
  // Don't await — fire and forget
  fetch('/api/track-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_id: card.id,
      offer_id: offer.id,
      source_page: window.location.pathname,
    }),
  })
  // Redirect immediately
  window.location.href = card.referral_url ?? card.apply_url
}
```

---

### `GET /api/blog`

Published blog posts with pagination. Content is not yet populated but the endpoint is live.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `10` | Posts per page (max 50) |
| `category` | string | — | `how-to`, `card-review`, `points-guide`, `transfer-partners`, `news`, `deals` |

**Response:**
```json
{
  "posts": [
    {
      "id": "uuid",
      "title": "Best Travel Cards in Canada 2026",
      "slug": "best-travel-cards-canada-2026",
      "excerpt": "We compared 40 cards...",
      "author": "Smart Card Offers",
      "cover_image": "https://...",
      "category": "card-review",
      "tags": ["travel", "aeroplan"],
      "published_at": "2026-03-01T12:00:00Z",
      "seo_title": "Best Travel Credit Cards Canada 2026",
      "seo_description": "Compare the top travel cards..."
    }
  ],
  "page": 1,
  "limit": 10,
  "count": 10
}
```

**Note:** `count` is the page count, not the total. No `total` field on this endpoint.

---

### `GET /api/mortgage-rates`

Current mortgage rates grouped by type and term. Available if you add a mortgage rates section.

**Response:**
```json
{
  "rates": [
    {
      "lender": "TD",
      "lender_slug": "td",
      "rate_type": "fixed",
      "term_years": 5,
      "rate": 5.24,
      "posted_rate": 6.79,
      "insured_rate": 4.99,
      "uninsured_rate": 5.24,
      "notes": null
    }
  ],
  "grouped": {
    "fixed": {
      "5": [ ...rates ],
      "3": [ ...rates ]
    },
    "variable": {
      "5": [ ...rates ]
    }
  }
}
```

**Note:** No scraper is actively populating this table — rates data may be empty or stale.

---

### `GET /api/scrape-logs`

Scraper health data. Use this for an internal status dashboard.

**Response:**
```json
{
  "logs": [ ...all entries, newest first ],
  "by_scraper": {
    "amex": [ ...entries for amex ],
    "td": [ ...entries for td ],
    "princeoftravel": [ ...entries for princeoftravel ]
  },
  "count": 50
}
```

Each log entry:
```json
{
  "id": "uuid",
  "scraper_name": "amex",
  "status": "success",
  "records_found": 12,
  "records_updated": 12,
  "error_message": null,
  "duration_ms": 4200,
  "ran_at": "2026-03-25T06:00:00Z"
}
```

`status` is one of `success`, `partial`, `failed`.

---

## Data types quick reference

```ts
type CardTier     = 'no-fee' | 'entry' | 'mid' | 'premium' | 'super-premium'
type RewardsType  = 'points' | 'cashback' | 'hybrid'
type OfferType    = 'welcome_bonus' | 'limited_time' | 'retention' | 'referral'
type CreditScore  = 'fair' | 'good' | 'very-good' | 'excellent'
```

---

## Pagination pattern

All paginated endpoints follow the same shape:

```ts
const res = await fetch(`/api/cards?page=${page}&limit=20`)
const { cards, count, total } = await res.json()

const totalPages = Math.ceil(total / 20)
const hasMore    = page < totalPages
```

Exception: `/api/blog` has no `total` — use `count < limit` to detect the last page.

---

## Confidence score

Every offer has a `confidence_score` (0–100) computed from three factors:

| Factor | Max score |
|--------|-----------|
| `is_verified = true` | +40 |
| `source_priority = 1` (PoT/churningcanada) | +30 |
| Seen within last 24h | +30 |

Use it for a verified badge: `confidence_score >= 70` is a good threshold. Don't show the raw number to users.

---

## Endpoints not for frontend use

These are backend-only and protected by `Authorization: Bearer {CRON_SECRET}`:

- `POST /api/scrape` — runs all scrapers manually
- `POST /api/scrape/fast` — runs churningcanada, amex, td
- `POST /api/scrape/deep` — runs mintflying, princeoftravel

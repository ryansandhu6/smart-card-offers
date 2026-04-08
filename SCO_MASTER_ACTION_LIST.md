# Smart Card Offers — Master Action List

> Last updated: 2026-04-07
> Status key: ✅ Done · 🔄 In Progress · ⬜ Not Started · ⏸ Deferred/Blocked

---

## Priority 1 — Core Infrastructure (Complete)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1.1 | Supabase schema + migrations | ✅ | Migrations 001–038 applied |
| 1.2 | BaseScraper priority system | ✅ | 1=PoT, 2=MintFlying, 3=CC, 4=others |
| 1.3 | Review queue (pending_review flow) | ✅ | Admin UI with approve/reject/merge |
| 1.4 | Offer history tracking | ✅ | `offer_history` table, `logOfferHistory()` |
| 1.5 | Admin auth (session cookie) | ✅ | ADMIN_PASSWORD env var |
| 1.6 | Vercel cron (fast 06:00, deep 07:00 UTC) | ✅ | `vercel.json` + CRON_SECRET |
| 1.7 | Scrape logs + alerts | ✅ | `scrape_logs` table, `sendAlert()` via Resend |
| 1.8 | Points valuations (CPP) | ✅ | `/api/valuations` endpoint |
| 1.9 | Referral click tracking | ✅ | `POST /api/track-click` |

---

## Priority 2 — Data Quality & Admin UI ✅ Complete

| # | Item | Status | Notes |
|---|------|--------|-------|
| 2.1 | FX fee + income requirement fields | ✅ | `foreign_transaction_fee`, `min_income`, `minimum_household_income` on cards; scraped by PoT + MintFlying; editable in admin review queue |
| 2.2 | AI auto-generate descriptions & headlines | ✅ | `scripts/ai-generate-content.ts`; dry-run + `--commit`; `content_source` column tracks origin; skips `manual` |
| 2.3 | Tier audit — correct boundaries | ✅ | no-fee $0 · entry $1–$49 · mid $50–$149 · premium $150–$299 · super-premium $300+ |
| 2.4 | Data quality formula | ✅ | Score = avg(spend_req fill % + description fill %); shown on dashboard |
| 2.5 | Dashboard — active offers count + pending attention | ✅ | Shows "X cards · Y total offers"; cards with pending offers show yellow "offers pending review →" badge |
| 2.6 | API — group offers by card | ✅ | `/api/cards` and `/api/offers` return offers nested under card |
| 2.7 | `review_reason` column on offers | ✅ | Values: `new_card`, `new_offer`, `higher_bonus`, `updated_terms`, `lower_priority_source`; badge shown in review queue |
| 2.8 | `content_source` column tracking | ✅ | `manual` / `ai_generated` / `scraper`; admin edits auto-tag as `manual` |

---

## Priority 3 — Scraper Improvements

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3.1 | ChurningCanada scraper | ⏸ | **Disabled pending verification** — code preserved, removed from cron; see Priority 5 |
| 3.2 | PoT scraper rewrite (Phase 1) | ✅ | 58/96 → 96/96 offers; FX fee + income extraction; priority 1 |
| 3.3 | MintFlying scraper rewrite | ✅ | RSC payload decoding; 65 cards; full card-level field mapping; priority 2 |
| 3.4 | Scraper priority reorder | ✅ | PoT=1, MintFlying=2, ChurningCanada=3 (was 1), others=4 |
| 3.5 | PoT Phase 2 — remaining 38 cards | ⬜ | Cards with non-standard page layouts not yet scraped |
| 3.6 | Bank-direct scrapers (Scotia, BMO, RBC, CIBC) | ⬜ | Removed in earlier cleanup; would be priority 0 (manual/bank-direct) |

---

## Priority 4 — API & Frontend

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4.1 | Public card listing page | ⬜ | Consume `/api/cards` |
| 4.2 | Card detail page | ⬜ | Consume `/api/cards/[slug]` |
| 4.3 | Offer comparison tool | ⬜ | Side-by-side card compare |
| 4.4 | Best offers feed | ⬜ | Homepage highlights — limited-time, highest value |
| 4.5 | SEO metadata + sitemap | ⬜ | `generateMetadata()` per card; XML sitemap |
| 4.6 | Newsletter subscribe flow | ⬜ | Form → Resend; confirmation email |
| 4.7 | Mortgage rates page | ⬜ | Scrapers exist; UI not built |

---

## Priority 5 — Polish & Launch Prep

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5.1 | ChurningCanada re-verification | ⬜ | Audit data accuracy before re-enabling; confirm community repo is still maintained |
| 5.2 | Merge flow improvements | ✅ | Comparison table per offer_type; admin picks which offer to keep; confirmed by user |
| 5.3 | Activate conflict warning | ✅ | "Will replace current [type] offer" shown before activating over existing active offer |
| 5.4 | Duplicate card cleanup | ⬜ | `scotiabank-scene-visa` vs `scotiabank-scene-visa-card` and similar stubs |
| 5.5 | Image audit | ⬜ | ~15 cards still missing card art; source from issuer websites |
| 5.6 | Referral URL audit | ⬜ | Several active cards missing referral/apply URLs |
| 5.7 | HANDOVER.md update | ⬜ | Reflect priority reorder, new columns, disabled CC scraper |
| 5.8 | Load testing | ⬜ | Verify API response times under concurrent requests |

---

## Completed This Session (2026-04-07)

- FX fee (`foreign_transaction_fee`) and income (`min_income`, `minimum_household_income`) fields: migration + scraper extraction (PoT + MintFlying) + admin review queue editor
- `review_reason` column (migration 037): scrapers populate; colour-coded badge in review queue
- `content_source` column (migration 038): tracks `manual` / `ai_generated`; admin writes auto-tag
- AI content generation script (`scripts/ai-generate-content.ts`): batched, dry-run by default, skips manual content
- Merge flow: comparison table per offer_type, admin selects which offers to keep active
- Activate warning: shows "will replace" note when pending offer type conflicts with active
- Scraper priorities: PoT=1, MintFlying=2, ChurningCanada=3
- ChurningCanada disabled in UI + API + cron routes (code preserved)
- Dashboard: "X cards · Y total offers" stat; pending-review attention state
- Tier guide boundaries corrected: entry $1–$49, mid $50–$149, premium $150–$299, super-premium $300+

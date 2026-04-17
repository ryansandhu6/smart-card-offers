// lib/scraper-base.ts
// Base class all card scrapers extend. Handles logging, timing, error recovery.

import {
  supabaseAdmin, logScrape, logOfferHistory, markExpiredOffersInactive,
  upsertCardInsurance, upsertCardEarnRates, upsertCardTransferPartners,
  upsertCardCredits, upsertCardLoungeAccess,
} from './supabase'
import type { ScrapedOffer, ScrapedMortgageRate, ScrapeResult } from '../types'

// -----------------------------------------------
// Stealth fetch — shared by all scrapers
// -----------------------------------------------

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
]

const RETRY_STATUSES = new Set([403, 429, 503])
const MAX_RETRIES = 3

async function stealthFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000
): Promise<Response> {
  // Random jitter before the first request
  const jitter = 200 + Math.random() * 600
  await new Promise(r => setTimeout(r, jitter))

  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

  const stealthHeaders: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-CA,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    // Caller headers last so they can override if needed
    ...(options.headers as Record<string, string> | undefined),
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...options, headers: stealthHeaders, signal: controller.signal })

      if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        const backoffMs = 5_000 * Math.pow(2, attempt) // 5s → 10s → 20s
        console.warn(`[scraper] HTTP ${res.status} for ${url} — retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms`)
        await new Promise(r => setTimeout(r, backoffMs))
        continue
      }

      return res
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries`)
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Remove "Sponsored" tag, asterisks, and non-printable-ASCII from a card name. */
function cleanCardName(raw: string): string {
  return raw
    .replace(/\bSponsored\b/gi, '')
    .replace(/[^\x20-\x7E]+/g, ' ')  // strip non-printable-ASCII (® ™ © etc.)
    .replace(/\*+/g, '')              // strip asterisks (e.g. "Mastercard®*")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Infer rewards_type from a card name when rewards_program is not yet known. */
function inferRewardsType(cardName: string): 'points' | 'cashback' | 'hybrid' {
  if (/cash.?back|dividend|simplycash|money.?back/i.test(cardName)) return 'cashback'
  return 'points'
}

// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseScraper {
  abstract name: string
  abstract issuerSlug: string

  /**
   * Source trust level — lower number = higher trust.
   *   1 = curated editorial   (PrinceOfTravelScraper)
   *   2 = curated aggregator  (MintFlyingScraper — explicit structured data)
   *   3 = community           (ChurningCanadaScraper)
   *   4 = aggregator          (RatehubCardsScraper, CreditCardGenius, others)
   *
   * A higher-numbered source will NEVER overwrite a lower-numbered row's content.
   * On a priority clash only `last_seen_at` and `confidence_score` are refreshed,
   * and the attempt is counted as `records_skipped` in scrape_logs.
   */
  protected sourcePriority = 4   // default: aggregator tier; override in subclasses
  protected sourceName     = ''  // human-readable scraper id written to source_name column

  /**
   * Whether offers from this scraper count as verified.
   * Set to true for curated (PoT, churningcanada) and bank-direct scrapers.
   */
  protected isVerified = false

  protected startTime = 0

  abstract scrape(): Promise<ScrapedOffer[]>

  async run(): Promise<ScrapeResult> {
    this.startTime = Date.now()
    console.log(`[${this.name}] Starting scrape...`)

    let records_found = 0
    let records_updated = 0
    let records_skipped = 0
    let status: 'success' | 'partial' | 'failed' = 'success'
    let error: string | undefined

    try {
      const offers = await this.scrape()
      records_found = offers.length
      console.log(`[${this.name}] Found ${records_found} offers`)

      for (const offer of offers) {
        // Guard: skip records with missing or sentinel headline/card_name
        if (!offer.headline || !offer.card_name) {
          console.warn(`[${this.name}] Skipping offer — missing headline or card_name: "${offer.card_name}" / "${offer.headline}"`)
          continue
        }
        try {
          const outcome = await this.saveOffer(offer)
          if (outcome === 'skipped') {
            records_skipped++
          } else {
            records_updated++
          }
        } catch (err) {
          console.error(`[${this.name}] Failed to save offer:`, err)
          status = 'partial'
        }
      }
    } catch (err) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
      console.error(`[${this.name}] Scrape failed:`, error)
    }

    // Mark any offers not seen in 7+ days as inactive
    await this.markStaleOffersInactive()
    // Mark any offers whose expires_at is in the past as inactive
    await markExpiredOffersInactive()

    const duration_ms = Date.now() - this.startTime

    if (records_skipped > 0) {
      console.log(`[${this.name}] ${records_skipped} offer(s) blocked by priority guard (existing source has higher trust)`)
    }

    await logScrape({
      scraper_name: this.name,
      status,
      records_found,
      records_updated,
      records_skipped,
      error_message: error,
      duration_ms,
    })

    console.log(`[${this.name}] Done. ${records_updated}/${records_found} saved, ${records_skipped} skipped in ${duration_ms}ms`)

    return { scraper: this.name, status, records_found, records_updated, records_skipped, error, duration_ms }
  }

  protected async saveOffer(offer: ScrapedOffer): Promise<'saved' | 'skipped'> {
    // ── Quick pre-check: reject clearly malformed card names before any DB work ──
    if (!offer.card_name || offer.card_name.length < 3) {
      console.warn(`[${this.name}] SKIP [bad-card-name] "${offer.card_name}"`)
      return 'skipped'
    }

    // ── Step 1 & 2: resolve card (always runs — card-level field writes happen here) ──
    // Fast path: caller pre-resolved the card ID (e.g. ChurningCanadaScraper).
    // Skip DB lookup and card creation entirely.
    let card_id: string
    let isNewCard = false

    if (offer._card_id) {
      card_id = offer._card_id
    } else {
      // ── Step 1: resolve issuer ────────────────────────────────────────────
      const { data: issuer } = await supabaseAdmin
        .from('issuers')
        .select('id')
        .eq('slug', offer.issuer_slug)
        .maybeSingle()

      // ── Step 2: find or create card ───────────────────────────────────────
      if (issuer) {
        // Use .limit(1) instead of .maybeSingle() — ilike can match multiple rows
        // (e.g. "Visa Infinite" hits several TD cards) and maybeSingle() throws PGRST116
        // on multiple results, making the entire saveOffer call count as a partial error.
        const { data: cardMatches } = await supabaseAdmin
          .from('credit_cards')
          .select('id')
          .eq('issuer_id', issuer.id)
          .ilike('name', `%${offer.card_name}%`)
          .limit(1)
        const card = cardMatches?.[0] ?? null

        if (card) {
          card_id = card.id

          // ── Null-guarded card writes ─────────────────────────────────────
          // Each field is only written when the DB value is currently NULL.
          // We run separate queries per field to avoid AND-chaining conditions
          // (which would skip ALL updates if even one field is already populated).
          if (offer.image_url) {
            await supabaseAdmin.from('credit_cards').update({ image_url: offer.image_url })
              .eq('id', card_id).is('image_url', null)
          }
          if (offer.earn_rate_multipliers && Object.keys(offer.earn_rate_multipliers).length) {
            await supabaseAdmin.from('credit_cards').update({ earn_rate_multipliers: offer.earn_rate_multipliers })
              .eq('id', card_id).is('earn_rate_multipliers', null)
          }
          if (offer.card_annual_fee_waived != null) {
            await supabaseAdmin.from('credit_cards').update({ annual_fee_waived_first_year: offer.card_annual_fee_waived })
              .eq('id', card_id).is('annual_fee_waived_first_year', null)
          }
          if (offer.card_supplementary_fee != null) {
            await supabaseAdmin.from('credit_cards').update({ supplementary_card_fee: offer.card_supplementary_fee })
              .eq('id', card_id).is('supplementary_card_fee', null)
          }
          if (offer.card_foreign_transaction_fee != null) {
            const { error: fxErr } = await supabaseAdmin.from('credit_cards').update({ foreign_transaction_fee: offer.card_foreign_transaction_fee })
              .eq('id', card_id).is('foreign_transaction_fee', null)
            if (fxErr) console.warn(`[${this.name}] card-field fx_fee write failed: ${fxErr.message} (${offer.card_name})`)
          }
          if (offer.card_min_income != null) {
            const { error: incErr } = await supabaseAdmin.from('credit_cards').update({ min_income: offer.card_min_income })
              .eq('id', card_id).is('min_income', null)
            if (incErr) console.warn(`[${this.name}] card-field min_income write failed: ${incErr.message} (${offer.card_name})`)
          }
          if (offer.card_min_household_income != null) {
            const { error: hhErr } = await supabaseAdmin.from('credit_cards').update({ minimum_household_income: offer.card_min_household_income })
              .eq('id', card_id).is('minimum_household_income', null)
            if (hhErr) console.warn(`[${this.name}] card-field min_household write failed: ${hhErr.message} (${offer.card_name})`)
          }
          // Annual fee only written when DB value is still the default (0).
          if (offer.card_annual_fee != null) {
            await supabaseAdmin.from('credit_cards').update({ annual_fee: offer.card_annual_fee })
              .eq('id', card_id).eq('annual_fee', 0)
          }
        } else {
          const ensured = await this.ensureCard(offer)
          card_id = ensured.id
          isNewCard = ensured.isNew
        }
      } else {
        const ensured = await this.ensureCard(offer)
        card_id = ensured.id
        isNewCard = ensured.isNew
      }
    }

    // ── Extended card detail tables ────────────────────────────────────────
    // Written after card_id is resolved — runs even if the offer itself is later
    // skipped. Priority guard enforced inside each upsert function.
    {
      const p = offer.sourcePriority ?? this.sourcePriority
      const cn = offer.card_name   // shorthand for log lines

      console.log(`[${this.name}] detail-tables "${cn}": insurance=${offer.insurance_rows?.length ?? 0} earn_rates=${offer.earn_rate_rows?.length ?? 0} transfer_partners=${offer.transfer_partner_rows?.length ?? 0} credits=${offer.credit_rows?.length ?? 0} lounge_access=${offer.lounge_access_rows?.length ?? 0} purchase_rate=${offer.card_purchase_rate ?? '-'} cash_advance=${offer.card_cash_advance_rate ?? '-'} balance_transfer=${offer.card_balance_transfer_rate ?? '-'}`)

      if (offer.insurance_rows?.length)
        await upsertCardInsurance(card_id, offer.insurance_rows, p)
      if (offer.earn_rate_rows?.length)
        await upsertCardEarnRates(card_id, offer.earn_rate_rows, p)
      if (offer.transfer_partner_rows?.length)
        await upsertCardTransferPartners(card_id, offer.transfer_partner_rows, p)
      if (offer.credit_rows?.length)
        await upsertCardCredits(card_id, offer.credit_rows, p)
      if (offer.lounge_access_rows?.length)
        await upsertCardLoungeAccess(card_id, offer.lounge_access_rows, p)
      // Interest rates → null-guarded writes to credit_cards
      if (offer.card_purchase_rate != null)
        await supabaseAdmin.from('credit_cards').update({ purchase_rate: offer.card_purchase_rate })
          .eq('id', card_id).is('purchase_rate', null)
      if (offer.card_cash_advance_rate != null)
        await supabaseAdmin.from('credit_cards').update({ cash_advance_rate: offer.card_cash_advance_rate })
          .eq('id', card_id).is('cash_advance_rate', null)
      if (offer.card_balance_transfer_rate != null)
        await supabaseAdmin.from('credit_cards').update({ balance_transfer_rate: offer.card_balance_transfer_rate })
          .eq('id', card_id).is('balance_transfer_rate', null)
    }

    // ── Post-resolution validation ──────────────────────────────────────────
    // Card-level field writes above are complete. Now validate the offer itself.
    // Returning 'skipped' here is fine — card metadata was already written.

    // 1. Reject if both value fields are absent or zero
    const hasPoints = (offer.points_value ?? 0) > 0
    const hasCash   = (offer.cashback_value ?? 0) > 0
    if (!hasPoints && !hasCash) {
      console.warn(`[${this.name}] SKIP [no-value] "${offer.headline}" (${offer.card_name})`)
      return 'skipped'
    }

    // 2. Reject bad headlines
    const hl = offer.headline?.trim() ?? ''
    if (!hl || hl.includes('$undefined') || hl.length < 10) {
      console.warn(`[${this.name}] SKIP [bad-headline] "${offer.headline}" (${offer.card_name})`)
      return 'skipped'
    }

    const incomingPriority = offer.sourcePriority ?? this.sourcePriority

    // 3. Reject points_value > 500,000 unless card is a Bonvoy program
    if ((offer.points_value ?? 0) > 500_000) {
      const { data: cardMeta } = await supabaseAdmin
        .from('credit_cards')
        .select('rewards_program')
        .eq('id', card_id)
        .maybeSingle()
      if (cardMeta?.rewards_program !== 'Bonvoy') {
        console.warn(`[${this.name}] SKIP [cap-exceeded] points_value=${offer.points_value} "${hl}" (${offer.card_name})`)
        return 'skipped'
      }
    }

    // 4. Reject value-duplicate: same (card_id, source_priority, points_value, cashback_value)
    //    already active under a different headline — prevents CPP-inflated dupes sneaking in.
    //    Same-headline rows are excluded so heartbeat updates are not blocked.
    const { data: valuePeers } = await supabaseAdmin
      .from('card_offers')
      .select('id, headline, points_value, cashback_value')
      .eq('card_id', card_id)
      .eq('source_priority', incomingPriority)
      .eq('is_active', true)

    const isDupe = (valuePeers ?? []).some(r =>
      r.headline !== hl &&
      r.points_value   === (offer.points_value   ?? null) &&
      r.cashback_value === (offer.cashback_value ?? null)
    )
    if (isDupe) {
      console.warn(`[${this.name}] SKIP [value-dupe] "${hl}" matches existing active offer (${offer.card_name})`)
      return 'skipped'
    }

    // ── Step 3: priority-aware save ─────────────────────────────────────────
    const now = new Date().toISOString()
    // Per-offer overrides (e.g. hardcoded fallback) take precedence over class defaults
    const incomingVerified = offer.isVerified ?? this.isVerified
    const confidence = this.computeConfidence(incomingPriority, incomingVerified, now)

    // Check if an offer already exists for this (card_id, offer_type).
    // For welcome_bonus we look up without headline (one row per card for this type).
    // For other types, headlines distinguish rows.
    // We order inactive rows first so that if both an active row and a pending row exist
    // (which can happen after a previous scrape created a pending row), we prefer to
    // update the pending row in-place rather than stacking another pending row on top.
    const existingBaseQuery = supabaseAdmin
      .from('card_offers')
      .select('id, source_priority, review_status, is_active, points_value, cashback_value, spend_requirement')
      .eq('card_id', card_id)
      .eq('offer_type', offer.offer_type)
      .order('is_active', { ascending: true }) // inactive (false) before active (true)
      .limit(1)
    const { data: existingRows } = offer.offer_type === 'welcome_bonus'
      ? await existingBaseQuery
      : await existingBaseQuery.eq('headline', offer.headline)
    const existing = existingRows?.[0] ?? null

    if (existing) {
      const existingPriority = existing.source_priority ?? 99

      // Determine whether to heartbeat-only or do a full overwrite.
      //
      //   priority 0 (manual)  → always heartbeat — manual offers are sacred
      //   existing < incoming  → heartbeat — existing is from a more-trusted source
      //   existing === incoming → compare values: heartbeat if unchanged, overwrite if changed
      //   existing > incoming  → overwrite — incoming is from a more-trusted source
      let shouldSkip: boolean
      if (existingPriority === 0) {
        shouldSkip = true
      } else if (existingPriority < incomingPriority) {
        shouldSkip = true
      } else if (existingPriority === incomingPriority) {
        // Same source re-scraping its own offer — only overwrite if something changed
        const samePoints = (existing.points_value ?? null) === (offer.points_value ?? null)
        const sameCash   = Number(existing.cashback_value ?? 0) === Number(offer.cashback_value ?? 0)
        const sameSpend  = (existing.spend_requirement ?? null) === (offer.spend_requirement ?? null)
        shouldSkip = samePoints && sameCash && sameSpend
      } else {
        shouldSkip = false  // incoming is from a strictly more-trusted source
      }

      if (shouldSkip) {
        // Heartbeat refresh only — do NOT log to offer_history (no content change).
        const heartbeat: Record<string, unknown> = { last_seen_at: now, confidence_score: confidence }
        const { error } = await supabaseAdmin
          .from('card_offers')
          .update(heartbeat)
          .eq('id', existing.id)
        if (error) throw new Error(`last_seen_at update failed: ${error.message}`)
        return 'skipped'
      } else {
        let review_reason: string
        if (existingPriority > incomingPriority) {
          review_reason = 'lower_priority_source'
        } else {
          const incomingPoints = offer.points_value ?? 0
          const incomingCash   = offer.cashback_value ?? 0
          const existingPoints = existing.points_value ?? 0
          const existingCash   = Number(existing.cashback_value ?? 0)
          review_reason = (incomingPoints > existingPoints || incomingCash > existingCash)
            ? 'higher_bonus'
            : 'updated_terms'
        }

        const pendingPayload = {
          headline: offer.headline,
          details: offer.details,
          points_value: offer.points_value,
          cashback_value: offer.cashback_value,
          spend_requirement: offer.spend_requirement,
          spend_timeframe_days: offer.spend_timeframe_days,
          extra_perks: offer.extra_perks,
          is_limited_time: offer.is_limited_time ?? false,
          expires_at: offer.expires_at,
          source_url: offer.source_url,
          scraped_at: now,
          last_seen_at: now,
          source_priority: incomingPriority,
          source_name: this.sourceName || null,
          is_verified: incomingVerified,
          confidence_score: confidence,
          is_active: false,
          review_status: 'pending_review',
          review_reason,
        }

        if (existing.is_active) {
          // The existing row is live — do NOT touch it. Insert a new pending row so
          // the active offer stays visible to users until an admin reviews and approves.
          const { error } = await supabaseAdmin
            .from('card_offers')
            .insert({ card_id, offer_type: offer.offer_type, ...pendingPayload })
          if (error) throw new Error(`pending insert (active preserved) failed: ${error.message}`)
        } else {
          // Existing row is already inactive/pending — safe to overwrite in-place.
          const { error } = await supabaseAdmin
            .from('card_offers')
            .update(pendingPayload)
            .eq('id', existing.id)
          if (error) throw new Error(`offer overwrite failed: ${error.message}`)
        }

        await logOfferHistory({ card_id, offer_type: offer.offer_type, headline: offer.headline, points_value: offer.points_value, cashback_value: offer.cashback_value, spend_requirement: offer.spend_requirement, spend_timeframe_days: offer.spend_timeframe_days, source_priority: incomingPriority })
        return 'saved'
      }
    } else {
      // New offer — insert
      const review_reason = isNewCard ? 'new_card' : 'new_offer'
      const { error } = await supabaseAdmin
        .from('card_offers')
        .insert({
          card_id,
          offer_type: offer.offer_type,
          headline: offer.headline,
          details: offer.details,
          points_value: offer.points_value,
          cashback_value: offer.cashback_value,
          spend_requirement: offer.spend_requirement,
          spend_timeframe_days: offer.spend_timeframe_days,
          extra_perks: offer.extra_perks,
          is_limited_time: offer.is_limited_time ?? false,
          expires_at: offer.expires_at,
          source_url: offer.source_url,
          scraped_at: now,
          last_seen_at: now,
          source_priority: incomingPriority,
          source_name: this.sourceName || null,
          is_verified: incomingVerified,
          confidence_score: confidence,
          is_active: false,
          review_status: 'pending_review',
          review_reason,
        })
      if (error) throw new Error(`offer insert failed: ${error.message}`)
      await logOfferHistory({ card_id, offer_type: offer.offer_type, headline: offer.headline, points_value: offer.points_value, cashback_value: offer.cashback_value, spend_requirement: offer.spend_requirement, spend_timeframe_days: offer.spend_timeframe_days, source_priority: incomingPriority })
      return 'saved'
    }
  }

  /**
   * confidence_score breakdown (max 100):
   *   is_verified true   → +40
   *   source_priority 1  → +30 | 2 → +15 | 3+ → +5
   *   last_seen < 24h    → +30 | < 72h → +20 | < 7d → +10 | older → +0
   */
  private computeConfidence(priority: number, verified: boolean, lastSeenAt: string): number {
    let score = verified ? 40 : 0
    score += priority === 1 ? 30 : priority === 2 ? 15 : 5
    const ageHours = (Date.now() - new Date(lastSeenAt).getTime()) / 3_600_000
    score += ageHours < 24 ? 30 : ageHours < 72 ? 20 : ageHours < 168 ? 10 : 0
    return score
  }

  /**
   * Marks offers inactive when last_seen_at is more than 7 days ago.
   * Called automatically at the end of every run().
   */
  protected async markStaleOffersInactive(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error, count } = await supabaseAdmin
      .from('card_offers')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('last_seen_at', cutoff)
      .not('last_seen_at', 'is', null)
    if (error) {
      console.warn(`[${this.name}] markStaleOffersInactive failed: ${error.message}`)
    } else if (count) {
      console.log(`[${this.name}] Marked ${count} stale offers inactive (last_seen_at > 7 days)`)
    }
  }

  protected async ensureCard(offer: ScrapedOffer): Promise<{ id: string; isNew: boolean }> {
    // Get issuer id
    const { data: issuer } = await supabaseAdmin
      .from('issuers')
      .select('id')
      .eq('slug', offer.issuer_slug)
      .single()

    if (!issuer) throw new Error(`Issuer not found: ${offer.issuer_slug}`)

    // 5 & 6. Strip "Sponsored", non-ASCII, and asterisks from card name before any DB work
    const cardName = cleanCardName(offer.card_name)
    const slug = cardName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

    // ── Fuzzy duplicate check ──────────────────────────────────────────────
    // Aggregators often use shortened names (e.g. "Amex Cobalt") that don't
    // exactly match seeded names ("American Express Cobalt Card"). Try several
    // strategies before creating a stub.

    // 1. Exact slug match — handles most aggregator name variants
    const { data: bySlug } = await supabaseAdmin
      .from('credit_cards')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle()
    if (bySlug) {
      if (bySlug.name !== cardName) {
        console.warn(`[${this.name}] Slug collision: "${cardName}" matches existing "${bySlug.name}" (slug=${slug}), reusing id`)
      }
      return { id: bySlug.id, isNew: false }
    }

    // 2. Keyword search — strip special chars, take first 3 meaningful words
    const STOP = new Set([
      'card', 'visa', 'from', 'with', 'world', 'elite',
      'infinite', 'mastercard', 'rewards', 'preferred', 'platinum',
    ])
    const keywords = cardName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP.has(w))
      .slice(0, 3)

    for (const kw of keywords) {
      const { data: matches } = await supabaseAdmin
        .from('credit_cards')
        .select('id')
        .eq('issuer_id', issuer.id)
        .ilike('name', `%${kw}%`)
        .limit(1)
      if (matches?.length) return { id: matches[0].id, isNew: false }
    }

    // ── Near-dupe warning ──────────────────────────────────────────────────────
    // Before creating a new row, check if any active card shares 2+ significant
    // words with the incoming name. Does not block the insert.
    {
      const DUPE_STOP = new Set(['card', 'visa', 'mastercard', 'the', 'of'])
      const incomingWords = cardName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2 && !DUPE_STOP.has(w))

      const { data: activeCards } = await supabaseAdmin
        .from('credit_cards')
        .select('name, slug')
        .eq('is_active', true)
        .neq('slug', slug)

      for (const existing of activeCards ?? []) {
        const existingWords = existing.name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length >= 2 && !DUPE_STOP.has(w))
        const shared = incomingWords.filter(w => existingWords.includes(w))
        if (shared.length >= 2) {
          console.warn(`[${this.name}] DUPE WARNING: '${cardName}' may duplicate '${existing.name}' (${existing.slug})`)
          break
        }
      }
    }

    // 3. No match — create a minimal stub card (will be enriched by seed later)
    const { data, error } = await supabaseAdmin
      .from('credit_cards')
      .upsert(
        {
          issuer_id: issuer.id,
          name: cardName,
          slug,
          card_type: 'visa',
          tier: 'entry',
          rewards_type: inferRewardsType(cardName),
          apply_url: offer.apply_url,
          image_url: offer.image_url ?? null,
          is_active: false,
          is_featured: false,
        },
        { onConflict: 'slug' }
      )
      .select('id')
      .single()

    if (error) throw error
    return { id: data.id, isNew: true }
  }

  protected fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 15_000
  ): Promise<Response> {
    return stealthFetch(url, options, timeoutMs)
  }

  protected parsePoints(text: string): number | undefined {
    // Handles "60,000 Aeroplan points", "35,000 Avion points", "15,000 Asia Miles",
    // "1,250 Membership Rewards points", "30,000 Avios", "20,000 points".
    // Allows up to 3 intermediate words (program name) before the unit keyword.
    const match = text.match(/([\d,]+)\s*(?:[A-Za-z+.]+\s+){0,3}(points?|miles?|Avios|MR|Scene\+|rewards?)/i)
    if (!match) return undefined
    return parseInt(match[1].replace(/,/g, ''))
  }

  protected parseSpend(text: string): { amount: number; days: number } | undefined {
    // Matches "$10,000 in the first 3 months", "$1,500 spending in 3 months", "$500 in 90 days"
    const match = text.match(/\$?([\d,]+)\s*(?:spending?)?\s*in\s*(?:the\s+)?(?:first\s+)?(\d+)\s*(month|day)/i)
    if (!match) return undefined
    const amount = parseInt(match[1].replace(/,/g, ''))
    const num = parseInt(match[2])
    const unit = match[3].toLowerCase()
    const days = unit.startsWith('month') ? num * 30 : num
    return { amount, days }
  }

  protected parseExpiry(text: string): string | undefined {
    // "Expires December 30, 2024" or "Offer ends Dec 31, 2024"
    const match = text.match(
      /(?:expires?|ends?)\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i
    )
    if (!match) return undefined
    const date = new Date(match[1])
    return isNaN(date.getTime()) ? undefined : date.toISOString().split('T')[0]
  }
}

export abstract class BaseMortgageScraper {
  abstract name: string
  abstract scrape(): Promise<ScrapedMortgageRate[]>

  protected fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 15_000
  ): Promise<Response> {
    return stealthFetch(url, options, timeoutMs)
  }

  async run(): Promise<ScrapeResult> {
    const startTime = Date.now()
    console.log(`[${this.name}] Starting mortgage rate scrape...`)

    let records_found = 0
    let records_updated = 0
    let status: 'success' | 'partial' | 'failed' = 'success'
    let error: string | undefined

    try {
      const rates = await this.scrape()
      records_found = rates.length

      for (const rate of rates) {
        try {
          await supabaseAdmin
            .from('mortgage_rates')
            .upsert(
              { ...rate, scraped_at: new Date().toISOString(), is_active: true },
              { onConflict: 'lender_slug,rate_type,term_years' }
            )
          records_updated++
        } catch (err) {
          status = 'partial'
          console.error(`Failed to save rate:`, err)
        }
      }
    } catch (err) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
    }

    const duration_ms = Date.now() - startTime

    await logScrape({
      scraper_name: this.name,
      status,
      records_found,
      records_updated,
      records_skipped: 0,
      error_message: error,
      duration_ms,
    })

    return { scraper: this.name, status, records_found, records_updated, records_skipped: 0, error, duration_ms }
  }
}

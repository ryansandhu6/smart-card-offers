// lib/scraper-base.ts
// Base class all card scrapers extend. Handles logging, timing, error recovery.

import { supabaseAdmin, logScrape, logOfferHistory, markExpiredOffersInactive } from './supabase'
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
   *   1 = churning community  (ChurningCanadaScraper)
   *   2 = curated editorial   (PrinceOfTravelScraper)
   *   3 = bank-direct         (Scotiabank, BMO, RBC, CIBC, Amex, TD scrapers)
   *   4 = aggregator          (MintFlyingScraper, RatehubCardsScraper)
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
    // ── Validation — runs before any DB work ────────────────────────────────

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

    // ── Step 1 & 2: resolve card ────────────────────────────────────────────
    // Fast path: caller pre-resolved the card ID (e.g. ChurningCanadaScraper).
    // Skip DB lookup and card creation entirely.
    let card_id: string

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
          const cardUpdates: Record<string, unknown> = {}
          if (offer.image_url) cardUpdates.image_url = offer.image_url
          if (offer.earn_rate_multipliers && Object.keys(offer.earn_rate_multipliers).length) {
            cardUpdates.earn_rate_multipliers = offer.earn_rate_multipliers
          }
          if (Object.keys(cardUpdates).length) {
            // Build query — only write fields that are currently NULL
            let q = supabaseAdmin.from('credit_cards').update(cardUpdates).eq('id', card_id)
            if (cardUpdates.image_url) q = q.is('image_url', null)
            if (cardUpdates.earn_rate_multipliers) q = q.is('earn_rate_multipliers', null)
            await q
          }
        } else {
          card_id = await this.ensureCard(offer)
        }
      } else {
        card_id = await this.ensureCard(offer)
      }
    }

    // ── Post-resolution validation ──────────────────────────────────────────
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

    // Check if an offer with the same natural key already exists
    const { data: existing } = await supabaseAdmin
      .from('card_offers')
      .select('id, source_priority, review_status, points_value, cashback_value, spend_requirement')
      .eq('card_id', card_id)
      .eq('offer_type', offer.offer_type)
      .eq('headline', offer.headline)
      .maybeSingle()

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
        // Incoming source has strictly higher trust (lower number) — full overwrite.
        const { error } = await supabaseAdmin
          .from('card_offers')
          .update({
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
          })
          .eq('id', existing.id)
        if (error) throw new Error(`offer overwrite failed: ${error.message}`)
        await logOfferHistory({ card_id, offer_type: offer.offer_type, headline: offer.headline, points_value: offer.points_value, cashback_value: offer.cashback_value, spend_requirement: offer.spend_requirement, spend_timeframe_days: offer.spend_timeframe_days, source_priority: incomingPriority })
        return 'saved'
      }
    } else {
      // New offer — insert
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

  protected async ensureCard(offer: ScrapedOffer): Promise<string> {
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
      return bySlug.id
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
      if (matches?.length) return matches[0].id
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
    return data.id
  }

  protected fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 15_000
  ): Promise<Response> {
    return stealthFetch(url, options, timeoutMs)
  }

  protected parsePoints(text: string): number | undefined {
    const match = text.match(/([\d,]+)\s*(points?|miles?|MR|Scene\+)/i)
    if (!match) return undefined
    return parseInt(match[1].replace(/,/g, ''))
  }

  protected parseSpend(text: string): { amount: number; days: number } | undefined {
    // Matches "$10,000 in 3 months" or "$1,500 spend in 90 days"
    const match = text.match(/\$?([\d,]+)\s*(?:spend)?\s*in\s*(\d+)\s*(month|day)/i)
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

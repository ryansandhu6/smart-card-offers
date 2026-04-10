// lib/supabase.ts
// Two clients: one for public (anon key), one for server/scrapers (service role key)

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Public client — safe to use in browser, respects RLS
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client — bypasses RLS, server-only (scrapers, API routes)
// NEVER expose this to the browser
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// -----------------------------------------------
// Typed query helpers
// -----------------------------------------------

export async function getCards(filters?: {
  issuer_slug?: string
  tier?: string
  rewards_type?: string
  tags?: string[]
  is_featured?: boolean
  page?: number
  limit?: number
}) {
  // issuer_slug must be resolved to an issuer_id for filtering (can't filter on joined columns)
  let issuer_id: string | undefined
  if (filters?.issuer_slug) {
    const { data: issuer } = await supabaseAdmin
      .from('issuers')
      .select('id')
      .eq('slug', filters.issuer_slug)
      .maybeSingle()
    if (!issuer) return { data: [], total: 0 }   // unknown issuer slug → empty result set
    issuer_id = issuer.id
  }

  const pageSize = Math.min(filters?.limit ?? 20, 100)
  const offset   = ((filters?.page ?? 1) - 1) * pageSize

  let query = supabaseAdmin
    .from('credit_cards')
    .select(`
      *,
      issuer:issuers(*),
      current_offers:card_offers(
        id, offer_type, headline, points_value, cashback_value,
        spend_requirement, spend_timeframe_days, extra_perks,
        is_limited_time, expires_at, is_verified,
        source_priority, last_seen_at, confidence_score,
        is_monthly_bonus, monthly_points_value, monthly_spend_requirement,
        monthly_cashback_value, bonus_months, start_month,
        review_reason, content_source
      ),
      insurance:card_insurance(coverage_type, maximum, details),
      earn_rates:card_earn_rates(category, rate, rate_text),
      transfer_partners:card_transfer_partners(partner_name, transfer_ratio, transfer_time, alliance, best_for),
      credits:card_credits(credit_type, amount, description, frequency),
      lounge_access:card_lounge_access(network, visits_per_year, guest_policy, details)
    `, { count: 'exact' })
    .eq('is_active', true)
    .eq('card_offers.is_active', true)
    .eq('card_offers.review_status', 'approved')
    .order('is_featured', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (issuer_id)             query = query.eq('issuer_id', issuer_id)
  if (filters?.is_featured)  query = query.eq('is_featured', true)
  if (filters?.rewards_type) query = query.eq('rewards_type', filters.rewards_type)
  if (filters?.tier)         query = query.eq('tier', filters.tier)
  if (filters?.tags?.length) query = query.overlaps('tags', filters.tags)

  const { data, error, count } = await query
  if (error) throw error
  return { data: data ?? [], total: count ?? 0 }
}

/**
 * Full-text search across card name, issuer name, and offer headlines.
 * Uses search_card_ids() Postgres function (migration 009) to rank results,
 * then fetches the full card shape identical to getCards().
 *
 * Returns { data, total } — same shape as getCards() so callers are interchangeable.
 */
export async function searchCards(
  q: string,
  filters?: {
    issuer_slug?: string
    tier?: string
    rewards_type?: string
    tags?: string[]
    is_featured?: boolean
    page?: number
    limit?: number
  }
) {
  const pageSize = Math.min(filters?.limit ?? 20, 100)
  const offset   = ((filters?.page ?? 1) - 1) * pageSize

  // ── Step 1: ranked card IDs from Postgres FTS ────────────────────────────
  const { data: matches, error: rpcError } = await supabaseAdmin
    .rpc('search_card_ids', { q, p_limit: pageSize, p_offset: offset })

  if (rpcError) throw rpcError
  if (!matches?.length) return { data: [], total: 0 }

  type Match = { card_id: string; rank: number; total_count: number }
  const rows  = matches as Match[]
  const ids   = rows.map(r => r.card_id)
  const total = Number(rows[0].total_count)

  // ── Step 2: fetch full card data for matching IDs ─────────────────────────
  // Same select shape as getCards() so the response is identical.
  let query = supabaseAdmin
    .from('credit_cards')
    .select(`
      *,
      issuer:issuers(*),
      current_offers:card_offers(
        id, offer_type, headline, points_value, cashback_value,
        spend_requirement, spend_timeframe_days, extra_perks,
        is_limited_time, expires_at, is_verified,
        source_priority, last_seen_at, confidence_score,
        is_monthly_bonus, monthly_points_value, monthly_spend_requirement,
        monthly_cashback_value, bonus_months, start_month,
        review_reason, content_source
      ),
      insurance:card_insurance(coverage_type, maximum, details),
      earn_rates:card_earn_rates(category, rate, rate_text),
      transfer_partners:card_transfer_partners(partner_name, transfer_ratio, transfer_time, alliance, best_for),
      credits:card_credits(credit_type, amount, description, frequency),
      lounge_access:card_lounge_access(network, visits_per_year, guest_policy, details)
    `)
    .in('id', ids)
    .eq('is_active', true)
    .eq('card_offers.is_active', true)
    .eq('card_offers.review_status', 'approved')

  // Apply the same optional filters as getCards()
  if (filters?.is_featured)  query = query.eq('is_featured', true)
  if (filters?.rewards_type) query = query.eq('rewards_type', filters.rewards_type)
  if (filters?.tier)         query = query.eq('tier', filters.tier)
  if (filters?.tags?.length) query = query.overlaps('tags', filters.tags)

  if (filters?.issuer_slug) {
    const { data: issuer } = await supabaseAdmin
      .from('issuers').select('id').eq('slug', filters.issuer_slug).maybeSingle()
    if (!issuer) return { data: [], total: 0 }
    query = query.eq('issuer_id', issuer.id)
  }

  const { data, error } = await query
  if (error) throw error

  // ── Step 3: re-sort by rank (Postgres .in() does not preserve order) ──────
  const rankMap = new Map(rows.map(r => [r.card_id, r.rank]))
  const sorted  = (data ?? []).sort(
    (a, b) => (rankMap.get(b.id) ?? 0) - (rankMap.get(a.id) ?? 0)
  )

  return { data: sorted, total }
}

export async function getActiveOffers(limitedTimeOnly = false, page = 1, limit = 20) {
  const pageSize = Math.min(limit, 100)
  const offset   = (page - 1) * pageSize

  let query = supabaseAdmin
    .from('card_offers')
    .select(`
      *,
      card:credit_cards(
        *,
        issuer:issuers(*),
        insurance:card_insurance(coverage_type, maximum, details),
        earn_rates:card_earn_rates(category, rate, rate_text),
        transfer_partners:card_transfer_partners(partner_name, transfer_ratio, transfer_time, alliance, best_for),
        credits:card_credits(credit_type, amount, description, frequency),
        lounge_access:card_lounge_access(network, visits_per_year, guest_policy, details)
      )
    `, { count: 'exact' })
    .eq('is_active', true)
    .eq('review_status', 'approved')
    // Best verified bank-direct offers first, then highest points/cashback within each tier
    .order('source_priority', { ascending: true })
    .order('points_value',    { ascending: false, nullsFirst: false })
    .order('cashback_value',  { ascending: false, nullsFirst: false })
    .order('confidence_score',{ ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1)

  if (limitedTimeOnly) query = query.eq('is_limited_time', true)

  const { data, error, count } = await query
  if (error) throw error
  return { data: data ?? [], total: count ?? 0 }
}

export async function getMortgageRates() {
  const { data, error } = await supabaseAdmin
    .from('mortgage_rates')
    .select('*')
    .eq('is_active', true)
    .order('rate_type')
    .order('term_years')
    .order('rate')

  if (error) throw error
  return data
}


export async function upsertMortgageRate(rate: {
  lender: string
  lender_slug: string
  rate_type: string
  term_years: number
  rate: number
  posted_rate?: number
  insured_rate?: number
  uninsured_rate?: number
  source_url: string
  notes?: string
}) {
  const { data, error } = await supabaseAdmin
    .from('mortgage_rates')
    .upsert(
      { ...rate, scraped_at: new Date().toISOString(), is_active: true },
      { onConflict: 'lender_slug,rate_type,term_years' }
    )
    .select()

  if (error) throw error
  return data
}

export async function markExpiredOffersInactive(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]   // "YYYY-MM-DD" matches DATE column
  const { error, count } = await supabaseAdmin
    .from('card_offers')
    .update({ is_active: false })
    .eq('is_active', true)
    .not('expires_at', 'is', null)
    .lt('expires_at', today)
  if (error) throw new Error(`markExpiredOffersInactive failed: ${error.message}`)
  return count ?? 0
}

export async function logScrape(entry: {
  scraper_name: string
  status: 'success' | 'partial' | 'failed'
  records_found: number
  records_updated: number
  records_skipped: number
  error_message?: string
  duration_ms: number
}) {
  await supabaseAdmin.from('scrape_logs').insert(entry)
}

// -----------------------------------------------
// Offer history helpers
// -----------------------------------------------

/**
 * Called from BaseScraper.saveOffer() after every successful offer write.
 * Inserts a history row when the offer is new OR when points/cashback changed.
 * Only refreshes last_seen_at when values are unchanged.
 */
export async function logOfferHistory(offer: {
  card_id: string
  offer_type: string
  headline: string
  points_value?: number
  cashback_value?: number
  spend_requirement?: number
  spend_timeframe_days?: number
  source_priority: number
}): Promise<void> {
  const { data: last } = await supabaseAdmin
    .from('offer_history')
    .select('id, points_value, cashback_value')
    .eq('card_id', offer.card_id)
    .eq('offer_type', offer.offer_type)
    .eq('headline', offer.headline)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = new Date().toISOString()
  const incoming_points   = offer.points_value   ?? null
  const incoming_cashback = offer.cashback_value ?? null

  if (!last) {
    // Brand new offer — always create a history row
    await supabaseAdmin.from('offer_history').insert({
      card_id:              offer.card_id,
      offer_type:           offer.offer_type,
      headline:             offer.headline,
      points_value:         incoming_points,
      cashback_value:       incoming_cashback,
      spend_requirement:    offer.spend_requirement    ?? null,
      spend_timeframe_days: offer.spend_timeframe_days ?? null,
      source_priority:      offer.source_priority,
      first_seen_at:        now,
      last_seen_at:         now,
    })
    return
  }

  const pointsChanged   = Number(incoming_points)   !== Number(last.points_value)
  const cashbackChanged = Number(incoming_cashback) !== Number(last.cashback_value)

  if (pointsChanged || cashbackChanged) {
    // Value changed — insert a new history row to capture the change
    await supabaseAdmin.from('offer_history').insert({
      card_id:              offer.card_id,
      offer_type:           offer.offer_type,
      headline:             offer.headline,
      points_value:         incoming_points,
      cashback_value:       incoming_cashback,
      spend_requirement:    offer.spend_requirement    ?? null,
      spend_timeframe_days: offer.spend_timeframe_days ?? null,
      source_priority:      offer.source_priority,
      first_seen_at:        now,
      last_seen_at:         now,
    })
  } else {
    // Same values — just refresh the heartbeat
    await supabaseAdmin
      .from('offer_history')
      .update({ last_seen_at: now })
      .eq('id', last.id)
  }
}

/**
 * Fetches offer_history_stats rows for a list of card IDs.
 * Returns a map keyed by "card_id:offer_type" for O(1) lookups.
 */
export async function getOfferHistoryStats(
  cardIds: string[]
): Promise<Map<string, { avg_points_12mo: number | null; avg_cashback_12mo: number | null }>> {
  if (!cardIds.length) return new Map()

  const { data, error } = await supabaseAdmin
    .from('offer_history_stats')
    .select('card_id, offer_type, avg_points_12mo, avg_cashback_12mo')
    .in('card_id', cardIds)

  if (error) console.error('[getOfferHistoryStats] Supabase error (is migration 005 applied?):', error.message)

  const map = new Map<string, { avg_points_12mo: number | null; avg_cashback_12mo: number | null }>()
  for (const row of data ?? []) {
    map.set(`${row.card_id}:${row.offer_type}`, {
      avg_points_12mo:   row.avg_points_12mo   ?? null,
      avg_cashback_12mo: row.avg_cashback_12mo ?? null,
    })
  }
  return map
}

// -----------------------------------------------
// Card detail table upserts
// All use a priority guard: a row is only written/updated when no existing row
// has a lower priority number (= higher trust). Lower number = higher trust.
// -----------------------------------------------

type InsuranceRow       = { coverage_type: string; maximum?: string; details?: string }
type EarnRateRow        = { category: string; rate: number; rate_text: string }
type TransferPartnerRow = { partner_name: string; transfer_ratio?: string; transfer_time?: string; alliance?: string; best_for?: string }
type CreditRow          = { credit_type: string; amount?: number; description?: string; frequency?: string }
type LoungeAccessRow    = { network: string; visits_per_year?: number; guest_policy?: string; details?: string }

async function priorityGuardedUpsert<T extends Record<string, unknown>>(
  table: string,
  cardId: string,
  keyColumn: string,
  rows: T[],
  sourcePriority: number
): Promise<void> {
  if (!rows.length) return
  const now = new Date().toISOString()

  // Fetch existing rows to check source_priority per key
  const { data: existing, error: selectErr } = await supabaseAdmin
    .from(table)
    .select(`${keyColumn}, source_priority`)
    .eq('card_id', cardId)

  if (selectErr) {
    console.warn(`[supabase] ${table} select error: ${selectErr.message}`)
    return
  }

  const existingMap = new Map(
    (existing ?? []).map((r: any) => [String(r[keyColumn]).toLowerCase(), r.source_priority as number])
  )

  const toUpsert = rows.filter(r => {
    const key = String(r[keyColumn]).toLowerCase()
    const existingPriority = existingMap.get(key)
    // Write if: no existing row, or existing row has same or lower trust (higher number)
    return existingPriority == null || existingPriority >= sourcePriority
  })
  if (!toUpsert.length) return

  const records = toUpsert.map(r => ({
    card_id: cardId,
    ...r,
    source_priority: sourcePriority,
    scraped_at: now,
  }))

  console.log(`[supabase] ${table} upserting ${records.length} rows for card ${cardId}`)
  const { error } = await supabaseAdmin
    .from(table)
    .upsert(records, { onConflict: `card_id,${keyColumn}` })
  if (error) console.warn(`[supabase] ${table} upsert error: ${error.message} | code: ${error.code} | hint: ${error.hint ?? '-'}`)
}

export async function upsertCardInsurance(cardId: string, rows: InsuranceRow[], sourcePriority: number): Promise<void> {
  await priorityGuardedUpsert('card_insurance', cardId, 'coverage_type', rows, sourcePriority)
}

export async function upsertCardEarnRates(cardId: string, rows: EarnRateRow[], sourcePriority: number): Promise<void> {
  await priorityGuardedUpsert('card_earn_rates', cardId, 'category', rows, sourcePriority)
}

export async function upsertCardTransferPartners(cardId: string, rows: TransferPartnerRow[], sourcePriority: number): Promise<void> {
  await priorityGuardedUpsert('card_transfer_partners', cardId, 'partner_name', rows, sourcePriority)
}

export async function upsertCardCredits(cardId: string, rows: CreditRow[], sourcePriority: number): Promise<void> {
  await priorityGuardedUpsert('card_credits', cardId, 'credit_type', rows, sourcePriority)
}

export async function upsertCardLoungeAccess(cardId: string, rows: LoungeAccessRow[], sourcePriority: number): Promise<void> {
  await priorityGuardedUpsert('card_lounge_access', cardId, 'network', rows, sourcePriority)
}

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
    if (!issuer) return []   // unknown issuer slug → empty result set
    issuer_id = issuer.id
  }

  const pageSize = Math.min(filters?.limit ?? 20, 100)
  const offset   = ((filters?.page ?? 1) - 1) * pageSize

  let query = supabaseAdmin
    .from('credit_cards')
    .select(`
      *,
      issuer:issuers(*),
      current_offer:card_offers(
        id, offer_type, headline, points_value, cashback_value,
        spend_requirement, spend_timeframe_days, extra_perks,
        is_limited_time, expires_at, is_verified,
        source_priority, last_seen_at, confidence_score
      )
    `)
    .eq('is_active', true)
    .eq('card_offers.is_active', true)
    .order('is_featured', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (issuer_id)             query = query.eq('issuer_id', issuer_id)
  if (filters?.is_featured)  query = query.eq('is_featured', true)
  if (filters?.rewards_type) query = query.eq('rewards_type', filters.rewards_type)
  if (filters?.tier)         query = query.eq('tier', filters.tier)
  if (filters?.tags?.length) query = query.overlaps('tags', filters.tags)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getActiveOffers(limitedTimeOnly = false, page = 1, limit = 20) {
  const pageSize = Math.min(limit, 100)
  const offset   = (page - 1) * pageSize

  let query = supabaseAdmin
    .from('card_offers')
    .select(`
      *,
      card:credit_cards(*, issuer:issuers(*))
    `)
    .eq('is_active', true)
    // Best verified bank-direct offers first, then highest points/cashback within each tier
    .order('source_priority', { ascending: true })
    .order('points_value',    { ascending: false, nullsFirst: false })
    .order('cashback_value',  { ascending: false, nullsFirst: false })
    .order('confidence_score',{ ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1)

  if (limitedTimeOnly) query = query.eq('is_limited_time', true)

  const { data, error } = await query
  if (error) throw error
  return data
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

export async function upsertOffer(offer: {
  card_id: string
  offer_type: string
  headline: string
  points_value?: number
  cashback_value?: number
  spend_requirement?: number
  spend_timeframe_days?: number
  extra_perks?: string[]
  is_limited_time?: boolean
  expires_at?: string
  source_url: string
  apply_url?: string
}) {
  const { data, error } = await supabaseAdmin
    .from('card_offers')
    .upsert(
      { ...offer, scraped_at: new Date().toISOString(), is_active: true },
      { onConflict: 'card_id,offer_type,headline' }
    )
    .select()

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

export async function logScrape(entry: {
  scraper_name: string
  status: 'success' | 'partial' | 'failed'
  records_found: number
  records_updated: number
  error_message?: string
  duration_ms: number
}) {
  await supabaseAdmin.from('scrape_logs').insert(entry)
}

// types/index.ts — Shared TypeScript types for Smart Card Offers

export type CardTier = 'no-fee' | 'entry' | 'mid' | 'premium' | 'super-premium'
export type CardType = 'visa' | 'mastercard' | 'amex' | 'discover'
export type RewardsType = 'points' | 'cashback' | 'hybrid'
export type OfferType = 'welcome_bonus' | 'additional_offer' | 'limited_time' | 'retention' | 'referral'
export type RateType = 'fixed' | 'variable' | 'hybrid'
export type CreditScore = 'fair' | 'good' | 'very-good' | 'excellent'

export interface Issuer {
  id: string
  name: string
  slug: string
  logo_url?: string
  website?: string
}

export interface CreditCard {
  id: string
  issuer_id: string
  issuer?: Issuer
  name: string
  slug: string
  card_type: CardType
  card_network?: string
  tier: CardTier
  annual_fee: number
  annual_fee_waived_first_year: boolean
  supplementary_card_fee?: number
  rewards_program?: string
  rewards_type: RewardsType
  earn_rate_base?: number
  earn_rate_multipliers?: Record<string, number>   // { dining: 3, groceries: 2 }
  transfer_partners?: string[]
  lounge_access: boolean
  airport_lounge_network?: string
  travel_insurance: boolean
  purchase_protection: boolean
  extended_warranty?: boolean
  price_protection?: boolean
  rental_car_insurance?: boolean
  mobile_wallet?: string[]
  foreign_transaction_fee?: number
  credit_score_min?: CreditScore
  min_income?: number
  income_type?: string
  apply_url?: string
  referral_url?: string
  image_url?: string
  short_description?: string
  pros?: string[]
  cons?: string[]
  best_for?: string[]
  card_color?: string
  signup_bonus_description?: string
  is_active: boolean
  is_featured: boolean
  tags?: string[]
  current_offers?: CardOffer[]
}

export interface CardOffer {
  id: string
  card_id: string
  card?: CreditCard
  offer_type: OfferType
  headline: string
  details?: string
  points_value?: number
  cashback_value?: number
  spend_requirement?: number
  spend_timeframe_days?: number
  extra_perks?: string[]
  is_limited_time: boolean
  expires_at?: string
  is_verified: boolean
  source_url?: string
  scraped_at?: string
  is_active: boolean
  source_priority?: number    // 1=churning, 2=prince, 3=bank, 4=aggregator
  last_seen_at?: string
  confidence_score?: number   // 1-100, computed from priority + verified + recency
  is_better_than_usual: boolean  // true if value > 90-day rolling avg in offer_history
}

export interface MortgageRate {
  id: string
  lender: string
  lender_slug: string
  rate_type: RateType
  term_years: number
  rate: number
  posted_rate?: number
  insured_rate?: number
  uninsured_rate?: number
  source_url?: string
  scraped_at: string
  notes?: string
}

export interface PointsValuation {
  program: string
  cpp_low: number
  cpp_mid: number
  cpp_high: number
  methodology?: string
}

export interface NewsletterSubscriber {
  email: string
  first_name?: string
  source?: string
  tags?: string[]
}

// Scraper output format — all scrapers return this shape
export interface ScrapedOffer {
  card_name: string
  issuer_slug: string
  offer_type: OfferType
  headline: string
  details?: string
  points_value?: number
  cashback_value?: number
  spend_requirement?: number
  spend_timeframe_days?: number
  extra_perks?: string[]
  is_limited_time?: boolean
  expires_at?: string
  source_url: string
  apply_url?: string
  image_url?: string   // scraped card image — saved to credit_cards.image_url if not already set
  // Earn rate multipliers to save back to credit_cards (only written if currently NULL).
  earn_rate_multipliers?: Record<string, number>
  // Per-offer trust overrides — if set, take precedence over the scraper class defaults.
  // Use these to downgrade individual offers that came from a hardcoded fallback rather
  // than a live scrape (e.g. sourcePriority: 3, isVerified: false).
  sourcePriority?: number
  isVerified?: boolean
  // Internal: pre-resolved card UUID.  If set, BaseScraper.saveOffer() skips the
  // card name lookup and creation step entirely.  Set by scrapers that resolve
  // cards ahead of time (e.g. ChurningCanadaScraper) so they can enforce
  // "never create new card rows" without overriding the full save pipeline.
  _card_id?: string
}

export interface ScrapedMortgageRate {
  lender: string
  lender_slug: string
  rate_type: RateType
  term_years: number
  rate: number
  posted_rate?: number
  insured_rate?: number
  uninsured_rate?: number
  source_url: string
  notes?: string
}

export interface ScrapeResult {
  scraper: string
  status: 'success' | 'partial' | 'failed'
  records_found: number
  records_updated: number
  records_skipped: number   // offers blocked by source-priority guard
  error?: string
  duration_ms: number
}

export interface OfferHistory {
  id: string
  card_id: string
  offer_type: string
  headline: string
  points_value: number | null
  cashback_value: number | null
  spend_requirement: number | null
  spend_timeframe_days: number | null
  source_priority: number
  first_seen_at: string
  last_seen_at: string
  is_active: boolean
  created_at: string
}

export interface OfferHistoryStats {
  card_id: string
  offer_type: string
  all_time_high_points: number | null
  avg_points_12mo: number | null
  all_time_high_cashback: number | null
  avg_cashback_12mo: number | null
  total_offers_seen: number
}

export interface CompareBestOffer {
  offer_type: OfferType
  headline: string
  points_value: number | null
  cashback_value: number | null
  spend_requirement: number | null
  spend_timeframe_days: number | null
  is_limited_time: boolean
  is_better_than_usual: boolean
}

export interface CompareCard {
  id: string
  name: string
  slug: string
  image_url: string | null
  referral_url: string | null
  annual_fee: number
  rewards_type: RewardsType
  rewards_program: string | null
  earn_rate_base: number | null
  earn_rate_multipliers: Record<string, number> | null
  lounge_access: boolean
  travel_insurance: boolean
  tier: CardTier
  issuer: Pick<Issuer, 'name' | 'slug'>
  best_offer: CompareBestOffer | null
}

export interface CompareResponse {
  cards: CompareCard[]
}

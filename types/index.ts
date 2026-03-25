// types/index.ts — Shared TypeScript types for Smart Card Offers

export type CardTier = 'no-fee' | 'entry' | 'mid' | 'premium' | 'super-premium'
export type CardType = 'visa' | 'mastercard' | 'amex' | 'discover'
export type RewardsType = 'points' | 'cashback' | 'hybrid'
export type OfferType = 'welcome_bonus' | 'limited_time' | 'retention' | 'referral'
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
  tier: CardTier
  annual_fee: number
  annual_fee_waived_first_year: boolean
  rewards_program?: string
  rewards_type: RewardsType
  earn_rate_base?: number
  earn_rate_multipliers?: Record<string, number>   // { dining: 3, groceries: 2 }
  transfer_partners?: string[]
  lounge_access: boolean
  travel_insurance: boolean
  purchase_protection: boolean
  foreign_transaction_fee?: number
  credit_score_min?: CreditScore
  apply_url?: string
  referral_url?: string
  image_url?: string
  is_active: boolean
  is_featured: boolean
  tags?: string[]
  current_offer?: CardOffer
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
  source_priority?: number    // 1=bank-direct, 2=aggregator, 3=hardcoded
  last_seen_at?: string
  confidence_score?: number   // 1-100, computed from priority + verified + recency
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
  error?: string
  duration_ms: number
}

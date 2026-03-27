// scripts/seed-annual-fees.ts
// Two passes:
//   1. Full-detail seed (migration 006 columns + annual_fee/tier corrections)
//      for the 23 canonical "known good" cards.
//   2. Fee-only corrections for all other cards that show annual_fee = 0
//      but have a real annual fee (mostly scraper-generated stubs).
//   3. Deactivate 3 junk entries created by scrapers.
//
// Safe to run multiple times.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/seed-annual-fees.ts

import { supabaseAdmin } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// PASS 1: Full-detail seed for canonical cards
// Covers migration 006 columns + annual_fee + tier.
// ─────────────────────────────────────────────────────────────────────────────

interface FullCardData {
  slug: string
  annual_fee?: number
  tier?: string
  income_type?: string
  supplementary_card_fee?: number
  mobile_wallet?: string[]
  extended_warranty?: boolean
  price_protection?: boolean
  rental_car_insurance?: boolean
  airport_lounge_network?: string | null
  signup_bonus_description?: string
}

const CANONICAL_CARDS: FullCardData[] = [
  // ── American Express ──────────────────────────────────────────────────────
  {
    slug: 'amex-cobalt',
    annual_fee: 155.88,
    tier: 'mid',
    income_type: 'personal',
    supplementary_card_fee: 0,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 2,500 bonus MR points per month (up to 30,000 in year 1) when you spend $500/month in the first 12 months.',
  },
  {
    slug: 'amex-platinum',
    annual_fee: 799,
    tier: 'super-premium',
    income_type: 'personal',
    supplementary_card_fee: 175,
    mobile_wallet: ['Apple Pay', 'Google Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: 'Amex Centurion',
    signup_bonus_description: 'Earn 70,000 Amex MR points after $10,000 spend in the first 3 months.',
  },
  {
    slug: 'amex-gold-rewards',
    annual_fee: 250,
    tier: 'mid',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 60,000 Amex MR points: 10,000 after first purchase, then 2,500/month for 20 months.',
  },
  {
    slug: 'amex-simplycash-preferred',
    annual_fee: 99,
    tier: 'mid',
    income_type: 'personal',
    supplementary_card_fee: 0,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 10% cash back on all purchases for the first 4 months (up to $400 cash back).',
  },
  {
    slug: 'amex-biz-gold',
    annual_fee: 199,
    tier: 'mid',
    income_type: 'business',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 40,000 Amex MR points after $7,500 spend in the first 3 months.',
  },
  {
    slug: 'amex-aeroplan-reserve',
    annual_fee: 599,
    tier: 'super-premium',
    income_type: 'personal',
    supplementary_card_fee: 199,
    mobile_wallet: ['Apple Pay', 'Google Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: 'Maple Leaf Lounge',
    signup_bonus_description: 'Earn up to 90,000 Aeroplan points: 60,000 after $7,500 spend in 3 months + 30,000 renewal bonus.',
  },

  // ── TD ────────────────────────────────────────────────────────────────────
  {
    slug: 'td-aeroplan-visa-infinite',
    annual_fee: 139,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 20,000 Aeroplan points: 10,000 after first purchase + 10,000 after $1,000 spend in 90 days. First year annual fee rebated.',
  },
  {
    slug: 'td-aeroplan-visa-infinite-privilege',
    annual_fee: 599,
    tier: 'super-premium',
    income_type: 'personal',
    supplementary_card_fee: 199,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: 'Maple Leaf Lounge',
    signup_bonus_description: 'Earn up to 40,000 Aeroplan points after $10,000 spend in 6 months.',
  },
  {
    slug: 'td-first-class-travel',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 80,000 TD Rewards points after $5,000 spend in 180 days.',
  },
  {
    slug: 'td-cash-back-visa-infinite',
    annual_fee: 139,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 6% cash back on all purchases for the first 3 months.',
  },

  // ── Scotiabank ────────────────────────────────────────────────────────────
  {
    slug: 'scotiabank-passport-visa-infinite',
    annual_fee: 150,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: 'Visa Airport Companion',
    signup_bonus_description: 'Earn up to 35,000 Scene+ bonus points in the first year. First year annual fee waived.',
  },
  {
    slug: 'scotiabank-momentum-visa-infinite',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 10% cash back on all purchases for the first 3 months (up to $2,000 spend). First year annual fee waived.',
  },
  {
    slug: 'scotiabank-gold-amex',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 29,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 45,000 Scene+ points in the first year. First year annual fee waived.',
  },

  // ── BMO ───────────────────────────────────────────────────────────────────
  {
    slug: 'bmo-eclipse-visa-infinite',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 60,000 BMO Rewards points. First year annual fee waived.',
  },
  {
    slug: 'bmo-cashback-world-elite',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 5% cash back on all purchases for the first 3 months (up to $2,500 spend). First year annual fee waived.',
  },

  // ── RBC ───────────────────────────────────────────────────────────────────
  {
    slug: 'rbc-avion-visa-infinite',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 35,000 Avion points in the first year.',
  },
  {
    slug: 'westjet-rbc-world-elite',
    annual_fee: 119,
    tier: 'premium',
    income_type: 'household',
    supplementary_card_fee: 119,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to $450 WestJet dollars: $250 after first purchase + $200 after $5,000 spend in 3 months.',
  },

  // ── CIBC ──────────────────────────────────────────────────────────────────
  {
    slug: 'cibc-aeroplan-visa-infinite',
    annual_fee: 139,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn up to 50,000 Aeroplan points: 20,000 after first purchase + 30,000 after $3,000 spend in 4 months. First year annual fee waived.',
  },
  {
    slug: 'cibc-dividend-visa-infinite',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 30,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 10% cash back on all purchases for the first 4 billing cycles (up to $200 cash back). First year annual fee waived.',
  },

  // ── No-fee cards (truly $0) ───────────────────────────────────────────────
  {
    slug: 'simplii-financial-cash-back-visa-card',
    annual_fee: 0,
    tier: 'no-fee',
    income_type: 'personal',
    supplementary_card_fee: 0,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: false,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 20% cash back on dining and bars for the first 3 months (up to $400 cash back).',
  },
  {
    slug: 'tangerine-money-back',
    annual_fee: 0,
    tier: 'no-fee',
    income_type: 'personal',
    supplementary_card_fee: 0,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: false,
    price_protection: false,
    rental_car_insurance: false,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 10% back in your chosen categories for the first 2 months (up to $100 cash back).',
  },
  {
    slug: 'rogers-red-world-elite-mastercard',
    annual_fee: 0,
    tier: 'no-fee',
    income_type: 'household',
    supplementary_card_fee: 0,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 3% unlimited cash back on all Rogers and Fido purchases; 1.5% on everything else.',
  },
  {
    slug: 'mbna-rewards-we-mc',
    annual_fee: 120,
    tier: 'premium',
    income_type: 'personal',
    supplementary_card_fee: 50,
    mobile_wallet: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    extended_warranty: true,
    price_protection: false,
    rental_car_insurance: true,
    airport_lounge_network: null,
    signup_bonus_description: 'Earn 5x points per $1 on eligible restaurant, grocery, digital media, membership, and household utility purchases in the first 90 days.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2: Fee-only corrections for all other cards with wrong annual_fee = 0
// ─────────────────────────────────────────────────────────────────────────────

interface FeeCorrection {
  slug: string
  annual_fee: number
  tier: string
}

const FEE_CORRECTIONS: FeeCorrection[] = [
  // ── Amex ──
  // True no-fee Amex cards
  { slug: 'amex-aeroplan-core',                              annual_fee: 0,   tier: 'no-fee'       },
  { slug: 'american-express-aeroplan-card',                  annual_fee: 0,   tier: 'no-fee'       },
  { slug: 'american-express-green-card',                     annual_fee: 0,   tier: 'no-fee'       },
  { slug: 'simplycash-card-from-american-express',           annual_fee: 0,   tier: 'no-fee'       },
  // Paid Amex cards (scraper stubs with wrong $0)
  { slug: 'american-express-aeroplan-reserve-card',          annual_fee: 599, tier: 'super-premium' },
  { slug: 'amex-biz-platinum',                               annual_fee: 799, tier: 'super-premium' },
  { slug: 'american-express-gold-rewards-card',              annual_fee: 250, tier: 'mid'           },
  { slug: 'amex-gold-pers',                                  annual_fee: 250, tier: 'mid'           },
  { slug: 'amex-marriott-biz',                               annual_fee: 150, tier: 'mid'           },
  { slug: 'amex-marriott-pers',                              annual_fee: 120, tier: 'mid'           },
  { slug: 'american-express-platinum-card',                  annual_fee: 799, tier: 'super-premium' },
  { slug: 'marriott-bonvoy-american-express-card',           annual_fee: 120, tier: 'mid'           },
  { slug: 'simplycash-preferred-card-from-american-express', annual_fee: 99,  tier: 'mid'           },

  // ── BMO ──
  { slug: 'bmo-air-miles-world-elite-mastercard-',           annual_fee: 120, tier: 'premium'       },
  { slug: 'bmo-ascend-we-mc',                                annual_fee: 150, tier: 'premium'       },
  { slug: 'bmo-ascend-world-elite-mastercard',               annual_fee: 150, tier: 'premium'       },
  { slug: 'bmo-ascend-world-elite-mastercard-',              annual_fee: 150, tier: 'premium'       },
  { slug: 'bmo-cashback-mastercard',                         annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'bmo-cashback-world-elite-mastercard',             annual_fee: 120, tier: 'premium'       },
  { slug: 'bmo-cashback-world-elite-mastercard-',            annual_fee: 120, tier: 'premium'       },
  { slug: 'bmo-eclipse-rise-visa',                           annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'bmo-eclipse-visa-infinite-privilege',             annual_fee: 499, tier: 'super-premium' },
  { slug: 'bmo-preferred-rate-mastercard',                   annual_fee: 20,  tier: 'entry'         },
  { slug: 'bmo-viporter-mastercard',                         annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'bmo-viporter-we-mc',                              annual_fee: 150, tier: 'premium'       },
  { slug: 'bmo-viporter-world-elite-mastercard',             annual_fee: 150, tier: 'premium'       },
  { slug: 'bmo-we-air-miles',                                annual_fee: 120, tier: 'premium'       },

  // ── CIBC ──
  { slug: 'air-france-klm-world-elite-mastercard-',          annual_fee: 120, tier: 'premium'       },
  { slug: 'cibc-adapta-mastercard',                          annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'cibc-aeroplan-visa',                              annual_fee: 0,   tier: 'entry'         },
  { slug: 'cibc-aeroplan-visa-infinite-privilege',           annual_fee: 599, tier: 'super-premium' },
  { slug: 'cibc-aeroplan-visa-privilege',                    annual_fee: 599, tier: 'super-premium' },
  { slug: 'cibc-aeroplan-visa-infinite-card',                annual_fee: 139, tier: 'premium'       },
  { slug: 'cibc-aventura-gold-visa',                         annual_fee: 139, tier: 'premium'       },
  { slug: 'cibc-aventura-visa',                              annual_fee: 0,   tier: 'entry'         },
  { slug: 'cibc-aventura-visa-gold',                         annual_fee: 139, tier: 'premium'       },
  { slug: 'cibc-aventura-visa-infinite',                     annual_fee: 139, tier: 'premium'       },
  { slug: 'cibc-aventura-visa-infinite-card',                annual_fee: 139, tier: 'premium'       },
  { slug: 'cibc-aventura-visa-infinite-privilege',           annual_fee: 499, tier: 'super-premium' },
  { slug: 'cibc-dividend-visa-infinite-card',                annual_fee: 120, tier: 'premium'       },

  // ── Scotiabank ──
  { slug: 'scotia-amex-gold',                                annual_fee: 120, tier: 'premium'       },
  { slug: 'scotia-amex-platinum',                            annual_fee: 499, tier: 'super-premium' },
  { slug: 'scotia-momentum-visa-infinite-card',              annual_fee: 120, tier: 'premium'       },
  { slug: 'scotia-passport-infinite',                        annual_fee: 150, tier: 'premium'       },
  { slug: 'scotiabank-american-express-card',                annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'scotiabank-american-express-platinum-card',       annual_fee: 499, tier: 'super-premium' },
  { slug: 'scotiabank-gold-american-express-card',           annual_fee: 120, tier: 'premium'       },
  { slug: 'scotiabank-momentum-mastercard',                  annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'scotiabank-momentum-no-fee-visa',                 annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'scotiabank-momentum-visa',                        annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'scotiabank-passport-visa-infinite-card',          annual_fee: 150, tier: 'premium'       },
  { slug: 'scotiabank-passport-visa-infinite-privilege-card',annual_fee: 499, tier: 'super-premium' },
  { slug: 'scotiabank-scene-visa-card',                      annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'scotiabank-value-visa-card',                      annual_fee: 29,  tier: 'entry'         },

  // ── TD ──
  { slug: 'td-aeroplan-platinum',                            annual_fee: 89,  tier: 'mid'           },
  { slug: 'td-aeroplan-visa-infinite-privilege-card',        annual_fee: 599, tier: 'super-premium' },
  { slug: 'td-aeroplan-visa-platinum-card',                  annual_fee: 89,  tier: 'mid'           },
  { slug: 'td-aeroplan-visa-privilege',                      annual_fee: 599, tier: 'super-premium' },
  { slug: 'td-cash-back-visa-card',                          annual_fee: 0,   tier: 'entry'         },
  { slug: 'td-cash-back-visa-infinite-card',                 annual_fee: 139, tier: 'premium'       },
  { slug: 'td-cashback-visa-infinite',                       annual_fee: 139, tier: 'premium'       },
  { slug: 'td-fct-visa-infinite',                            annual_fee: 120, tier: 'premium'       },
  { slug: 'td-fct-visa-platinum',                            annual_fee: 89,  tier: 'mid'           },
  { slug: 'td-low-rate-visa-card',                           annual_fee: 25,  tier: 'entry'         },
  { slug: 'td-platinum-travel-visa-card',                    annual_fee: 89,  tier: 'mid'           },
  { slug: 'td-rewards-visa-card',                            annual_fee: 0,   tier: 'entry'         },

  // ── RBC ──
  { slug: 'more-rewards-rbc-visa',                           annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'more-rewards-rbc-visa-infinite',                  annual_fee: 120, tier: 'premium'       },
  { slug: 'rbc-avion-visa-infinite-card',                    annual_fee: 120, tier: 'premium'       },
  { slug: 'rbc-avion-visa-infinite-privilege',               annual_fee: 399, tier: 'super-premium' },
  { slug: 'rbc-avion-visa-platinum',                         annual_fee: 110, tier: 'mid'           },
  { slug: 'rbc-british-airways-visa-infinite',               annual_fee: 165, tier: 'premium'       },
  { slug: 'rbc-cash-back-mastercard',                        annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'rbc-cash-back-preferred-world-elite-mastercard',  annual_fee: 99,  tier: 'mid'           },
  { slug: 'rbc-ion-visa',                                    annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'rbc-visa-classic-low-rate',                       annual_fee: 20,  tier: 'entry'         },
  { slug: 'rbc-visa-platinum',                               annual_fee: 75,  tier: 'entry'         },
  { slug: 'rbc-visa-platinum-avion',                         annual_fee: 110, tier: 'mid'           },
  { slug: 'westjet-rbc-mastercard',                          annual_fee: 39,  tier: 'entry'         },
  { slug: 'rbc-westjet-we',                                  annual_fee: 119, tier: 'premium'       },

  // ── MBNA ──
  { slug: 'mbna-true-line-gold-mastercard',                  annual_fee: 39,  tier: 'entry'         },
  { slug: 'mbna-true-line-mastercard',                       annual_fee: 0,   tier: 'no-fee'        },

  // ── National Bank ──
  { slug: 'national-bank-world-elite-mastercard-',           annual_fee: 150, tier: 'premium'       },

  // ── Meridian ──
  { slug: 'meridian-visa-infinite-travel-rewards-card',      annual_fee: 99,  tier: 'mid'           },

  // ── Laurentian Bank ──
  { slug: 'laurentian-bank-visa-infinite-card',              annual_fee: 130, tier: 'premium'       },

  // ── Rogers ──
  { slug: 'rogers-red-mastercard',                           annual_fee: 0,   tier: 'no-fee'        },

  // ── Neo Financial (all no-fee) ──
  { slug: 'cathay-world-elite-mastercard-powered-by-neo',    annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'neo-world-elite-mastercard',                      annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'neo-world-mastercard-',                           annual_fee: 0,   tier: 'no-fee'        },

  // ── Others (all legitimately $0) ──
  { slug: 'brim-mastercard',                                 annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'canadian-tire-triangle-world-elite-mastercard',   annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'desjardins-cash-back-mastercard',                 annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'home-trust-preferred-visa-card',                  annual_fee: 0,   tier: 'no-fee'        },
  { slug: 'pc-financial-world-elite-mastercard',             annual_fee: 0,   tier: 'no-fee'        },
]

// ─────────────────────────────────────────────────────────────────────────────
// PASS 3: Deactivate scraper junk entries
// ─────────────────────────────────────────────────────────────────────────────

const JUNK_SLUGS = [
  'complimentary-lounge-visits-with-visa',       // PoT navigation text scraped as a card
  'sponsoredbmo-eclipse-visa-infinite-card',     // "Sponsored" prefix artefact
  'sponsoredtd-first-class-travel-visa-infinite-card', // "Sponsored" prefix artefact
]

// ─────────────────────────────────────────────────────────────────────────────

async function runPass<T extends { slug: string }>(
  label: string,
  items: T[],
  buildUpdate: (item: T) => Record<string, unknown>
) {
  console.log(`\n── ${label} (${items.length} entries) ──`)
  let ok = 0, skipped = 0, failed = 0

  for (const item of items) {
    const { error } = await supabaseAdmin
      .from('credit_cards')
      .update(buildUpdate(item))
      .eq('slug', item.slug)

    if (error) {
      console.error(`  FAILED  [${item.slug}]: ${error.message}`)
      failed++
    } else {
      console.log(`  OK      [${item.slug}]`)
      ok++
    }
  }

  console.log(`  → ${ok} updated, ${skipped} skipped, ${failed} failed`)
  return { ok, skipped, failed }
}

async function main() {
  // Pass 1 — canonical cards: full field set
  const p1 = await runPass('Pass 1: canonical cards (full fields)', CANONICAL_CARDS, ({ slug: _s, ...rest }) => rest)

  // Pass 2 — fee-only corrections for stubs
  const p2 = await runPass('Pass 2: fee corrections for scraper stubs', FEE_CORRECTIONS, ({ slug: _s, ...rest }) => rest)

  // Pass 3 — deactivate junk
  console.log(`\n── Pass 3: deactivate junk entries (${JUNK_SLUGS.length} entries) ──`)
  let junkOk = 0, junkFailed = 0
  for (const slug of JUNK_SLUGS) {
    const { error } = await supabaseAdmin
      .from('credit_cards')
      .update({ is_active: false })
      .eq('slug', slug)
    if (error) { console.error(`  FAILED  [${slug}]: ${error.message}`); junkFailed++ }
    else { console.log(`  DEACTIVATED  [${slug}]`); junkOk++ }
  }
  console.log(`  → ${junkOk} deactivated, ${junkFailed} failed`)

  const total = p1.ok + p2.ok + junkOk
  const totalFailed = p1.failed + p2.failed + junkFailed
  console.log(`\nTotal: ${total} updated/deactivated, ${totalFailed} failed.`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

// scrapers/aggregators.ts
// Scrapers for Canadian credit card aggregator sites
//
// Robots.txt checked 2026-03-23:
//   mintflying.com           Allow: /                            ✅ built
//   creditcardgenius.ca      Allow: / (blocks /go/ /offers/*)   ✅ built (JS-rendered — text scan)
//   ratehub.ca               Allow: / (blocks apply pages only)  ✅ built (Next.js — __NEXT_DATA__ + scan)
//   flytrippers.com          Allow: / (blocks /*?*mdrv only)    ✅ built (WordPress — heading scan)
//   greedyrates.ca           301 → money.ca, robots.txt → 403   ⛔ skipped (cannot verify policy)
//   princeoftravel.com       Allow: / (blocks /account/ /api/ /dev/ only) ✅ built (Next.js App Router — RSC + section parse)

import * as cheerio from 'cheerio'
import { BaseScraper } from '../lib/scraper-base'
import type { ScrapedOffer } from '../types'

// -----------------------------------------------
// Shared helpers
// -----------------------------------------------

const ISSUER_MAP: Record<string, string> = {
  'american express': 'amex',
  'amex': 'amex',
  'td bank': 'td',
  'td ': 'td',
  'td®': 'td',
  '"td"': 'td',
  'scotiabank': 'scotiabank',
  'bmo': 'bmo',
  'royal bank': 'rbc',
  ' rbc': 'rbc',
  'cibc': 'cibc',
  'air france': 'cibc',     // Air France KLM World Elite MC issued by CIBC
  'national bank': 'national-bank',
  'tangerine': 'tangerine',
  'simplii': 'simplii',
  'pc financial': 'pc-financial',
  'desjardins': 'desjardins',
  'westjet': 'rbc',
  'mbna': 'mbna',
  'rogers bank': 'rogers-bank',
  'rogers red': 'rogers-bank',
  ' rogers': 'rogers-bank',
  'hsbc': 'hsbc',
  'brim': 'brim',
  ' neo ': 'neo-financial',
  'neo world': 'neo-financial',
  'cathay world': 'neo-financial',  // Cathay World Elite MC – Powered by Neo
  'canadian tire': 'canadian-tire',
  'triangle': 'canadian-tire',
  'home trust': 'home-trust',
  'laurentian': 'laurentian-bank',
  'meridian': 'meridian',
  'aeroplan® credit card': 'td',  // standalone Aeroplan CC issued by TD (no bank prefix)
}

function resolveIssuer(raw: string): string {
  const lower = ` ${(raw ?? '').toLowerCase()} `
  for (const [key, slug] of Object.entries(ISSUER_MAP)) {
    if (lower.includes(key)) return slug
  }
  return 'unknown'
}

/** Slugs that exist in our issuers table — used to filter out un-saveable offers */
const KNOWN_ISSUER_SLUGS = new Set([
  'amex', 'td', 'scotiabank', 'bmo', 'rbc', 'cibc',
  'national-bank', 'hsbc', 'tangerine', 'pc-financial', 'desjardins',
  'mbna', 'rogers-bank',
  // Added 2026-03-24 for Prince of Travel coverage
  'brim', 'neo-financial', 'canadian-tire', 'home-trust',
  'laurentian-bank', 'meridian', 'simplii',
])

const OFFER_KW = /points?|cash\s*back|bonus|earn|miles?|reward|Scene\+|Aeroplan|Avion|WestJet|AIR\s*MILES/i
const HAS_NUM  = /\$[\d,]+|[\d,]+\s*(?:points?|miles?)|[\d.]+\s*%/i

function scanPageOffers($: cheerio.CheerioAPI, root?: cheerio.Cheerio<any>): string[] {
  const found: string[] = []
  const target = root ?? $('body')
  target.find('p, li, h2, h3, h4').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length >= 20 && t.length <= 350 && OFFER_KW.test(t) && HAS_NUM.test(t)) {
      found.push(t)
    }
  })
  return [...new Set(found)]
}

function inferCardName(text: string): string {
  const m = text.match(/(?:the\s+)?([A-Z][A-Za-z®™*\s]{4,50}(?:Card|Mastercard|Visa|Amex))/i)
  return m?.[1]?.trim() ?? 'Unknown Card'
}

/** Find the nearest <img> to a matched element and return its absolute src */
function nearestImg($: cheerio.CheerioAPI, el: any, baseUrl: string): string | undefined {
  // Check the element itself, then parent, then siblings
  const candidates = [
    $(el).find('img').first(),
    $(el).closest('[class]').find('img').first(),
    $(el).parent().find('img').first(),
  ]
  for (const $img of candidates) {
    const src = $img.attr('src') ?? $img.attr('data-src') ?? ''
    if (!src || src.startsWith('data:')) continue
    return src.startsWith('http') ? src : new URL(src, baseUrl).href
  }
  return undefined
}

// -----------------------------------------------
// MintFlying
// robots.txt: Allow: /  — fully permitted
//
// Strategy: the listing page (/credit-cards) embeds all card objects in the
// RSC payload via self.__next_f.push([1, "..."]) chunks. Each card object has:
//   title, slug, issuer, annualFee, firstYearFeeWaived, additionalCardFee,
//   foreignTransactionFee, annualIncome, householdIncome,
//   signupBonus, minSpendRequired, minSpendPeriod, minSpendTiers,
//   earnRates, rewardsProgram, pointsCurrency, tags, loungeAccess,
//   applyUrl, cardImage, sourceUrl
// We scan for every "signupBonus" occurrence and extract the enclosing object.
// No detail page scraping needed — listing page has all fields.
// -----------------------------------------------
export class MintFlyingScraper extends BaseScraper {
  name = 'mintflying'
  issuerSlug = 'aggregator'
  protected sourcePriority = 2   // curated editorial — same tier as PoT
  protected sourceName     = 'mintflying'
  protected isVerified     = true

  private readonly LISTING_URL = 'https://www.mintflying.com/credit-cards'
  private readonly BASE_URL    = 'https://www.mintflying.com'

  async scrape(): Promise<ScrapedOffer[]> {
    const res = await this.fetchWithTimeout(this.LISTING_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const html = await res.text()
    const offers = this.extractAllCards(html)

    const filtered = offers.filter(o => KNOWN_ISSUER_SLUGS.has(o.issuer_slug))
    console.log(`[mintflying] extracted ${offers.length} cards, ${filtered.length} with known issuers`)
    return filtered
  }

  /**
   * Decode all RSC chunks from the page, then scan the decoded payload for
   * card objects. The RSC data is double-escaped in the raw HTML
   * (self.__next_f.push([1, "...\"signupBonus\"..."])) so we must first
   * JSON-decode each chunk string before searching for keys.
   */
  private extractAllCards(html: string): ScrapedOffer[] {
    // Step 1 — decode each __next_f.push([1, "..."]) chunk into a plain string
    const chunkRe = /\.__next_f\.push\(\[1\s*,\s*"((?:[^"\\]|\\.)*)"\]\)/g
    const chunks: string[] = []
    let m: RegExpExecArray | null
    while ((m = chunkRe.exec(html)) !== null) {
      try { chunks.push(JSON.parse(`"${m[1]}"`)) } catch {}
    }
    const payload = chunks.join('')

    // Step 2 — find every "signupBonus" key and extract the enclosing object
    const offers: ScrapedOffer[] = []
    const seen = new Set<string>()
    let pos = 0

    while (true) {
      const idx = payload.indexOf('"signupBonus"', pos)
      if (idx === -1) break
      pos = idx + 1

      // Walk back to find the opening { of this card object (up to 5 000 chars)
      let start = idx
      let depth = 0
      for (let i = idx; i >= Math.max(0, idx - 5000); i--) {
        if (payload[i] === '}') depth++
        else if (payload[i] === '{') {
          if (depth === 0) { start = i; break }
          depth--
        }
      }

      // Walk forward to find the matching closing }
      depth = 0
      let end = start
      for (let i = start; i < Math.min(payload.length, start + 5000); i++) {
        if (payload[i] === '{') depth++
        else if (payload[i] === '}') {
          depth--
          if (depth === 0) { end = i + 1; break }
        }
      }

      const raw = payload.slice(start, end)
      if (seen.has(raw)) continue
      seen.add(raw)

      try {
        const card = JSON.parse(raw)
        if (card.signupBonus && (card.title || card.name)) {
          const offer = this.cardToOffer(card)
          if (offer) offers.push(offer)
        }
      } catch {}
    }

    return offers
  }

  private cardToOffer(card: any): ScrapedOffer | null {
    const cardName = String(card.title ?? card.name ?? '').trim()
    const rawBonus  = String(card.signupBonus ?? '').trim()
    if (!cardName || !rawBonus) return null

    const issuer_slug = resolveIssuer(String(card.issuer ?? card.brand ?? ''))

    // ── Welcome bonus headline ───────────────────────────────────────────────
    // signupBonus is a text headline ("Up to 60,000 Membership Rewards points")
    const headline = rawBonus

    // ── Points / cashback ────────────────────────────────────────────────────
    // Never use signupBonusValue: MintFlying sets it to a CPP dollar estimate.
    const points_value   = this.parsePoints(headline)
    const cashbackMatch  = headline.match(/\$([\d,]+)(?:\s*cash\s*back|\s*cashback)/i)
    const cashback_value = cashbackMatch ? parseFloat(cashbackMatch[1].replace(/,/g, '')) : undefined

    // ── Spend requirement ────────────────────────────────────────────────────
    // minSpendRequired is an integer; minSpendPeriod is e.g. "first 3 months"
    const periodDays         = this.parsePeriod(String(card.minSpendPeriod ?? ''))
    const spendFromText      = this.parseSpend(headline)
    const spend_requirement  = card.minSpendRequired != null ? Number(card.minSpendRequired) : spendFromText?.amount
    const spend_timeframe_days = periodDays ?? spendFromText?.days

    // ── Bonus tier details ───────────────────────────────────────────────────
    // minSpendTiers: [{bonus, amount, period}, ...]
    const tiers = Array.isArray(card.minSpendTiers) ? card.minSpendTiers as Array<{bonus: string; amount: number; period: string}> : []
    const details = tiers.length > 0
      ? tiers.map(t => `${t.bonus} with $${Number(t.amount).toLocaleString('en-CA')} spend in ${t.period}`).join(' • ')
      : undefined

    // ── Expiry ───────────────────────────────────────────────────────────────
    const rawExpiry = String(card.signupBonusExpiry ?? '')
    const expires_at = (rawExpiry && !rawExpiry.includes('undefined'))
      ? this.parseExpiry(`expires ${rawExpiry}`)
      : undefined

    // ── URLs + image ─────────────────────────────────────────────────────────
    const slug       = String(card.slug ?? '')
    const source_url = slug ? `${this.BASE_URL}/credit-cards/${slug}` : this.LISTING_URL
    const apply_url  = String(card.applyUrl ?? card.sourceUrl ?? source_url)
    const raw_img    = String(card.cardImage ?? card.image ?? card.imageUrl ?? '')
    const image_url  = raw_img
      ? (raw_img.startsWith('http') ? raw_img : `${this.BASE_URL}${raw_img}`)
      : undefined

    // ── Card-level fields ────────────────────────────────────────────────────
    const isSentinel = (v: unknown) => v == null || String(v).includes('undefined')

    const card_annual_fee         = card.annualFee != null ? Number(card.annualFee) : undefined
    const card_annual_fee_waived  = typeof card.firstYearFeeWaived === 'boolean' ? card.firstYearFeeWaived : undefined
    const card_supplementary_fee  = card.additionalCardFee != null ? Number(card.additionalCardFee) : undefined

    const card_foreign_transaction_fee: number | null | undefined = isSentinel(card.foreignTransactionFee)
      ? undefined
      : Number(card.foreignTransactionFee)   // 0 = no fee, 2.5 = standard fee

    const card_min_income: number | undefined = isSentinel(card.annualIncome)
      ? undefined
      : Number(card.annualIncome)

    const card_min_household_income: number | undefined = isSentinel(card.householdIncome)
      ? undefined
      : Number(card.householdIncome)

    // ── Earn-rate multipliers + earn_rate_rows ────────────────────────────────
    // earnRates: [{category: "Air Canada", rate: "2 Aeroplan points per $1"}, ...]
    const earn_rate_multipliers: Record<string, number> = {}
    const earn_rate_rows: NonNullable<ScrapedOffer['earn_rate_rows']> = []
    for (const er of (card.earnRates ?? []) as Array<{category: string; rate: string}>) {
      const rateMatch = er.rate?.match(/(\d+(?:\.\d+)?)\s*(?:points?|miles?|MR|%)?\s*per\s*\$1/i)
        ?? er.rate?.match(/^(\d+(?:\.\d+)?)\s*[x×]/i)
      if (!rateMatch) continue
      const rate = parseFloat(rateMatch[1])
      if (rate <= 0 || rate > 30) continue
      const cat = er.category
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 30)
      if (cat && !earn_rate_multipliers[cat]) {
        earn_rate_multipliers[cat] = rate
        earn_rate_rows.push({ category: er.category, rate, rate_text: er.rate })
      }
    }

    // ── Transfer partners ─────────────────────────────────────────────────────
    const transfer_partner_rows: NonNullable<ScrapedOffer['transfer_partner_rows']> = []
    const rawPartners: any[] = Array.isArray(card.transferPartners) ? card.transferPartners
      : Array.isArray(card.rewardPartners) ? card.rewardPartners : []
    for (const p of rawPartners) {
      const partner_name = String(p.name ?? p.partner ?? p.programName ?? '').trim()
      if (!partner_name) continue
      transfer_partner_rows.push({
        partner_name,
        transfer_ratio: p.transferRatio ?? p.ratio ?? undefined,
        transfer_time:  p.transferTime  ?? p.time  ?? undefined,
        alliance:       p.alliance      ?? undefined,
        best_for:       p.bestFor       ?? p.best_for ?? undefined,
      })
    }

    // ── Credits (travel credits, NEXUS, dining, etc.) ─────────────────────────
    const credit_rows: NonNullable<ScrapedOffer['credit_rows']> = []
    const rawCredits: any[] = Array.isArray(card.travelCredits) ? card.travelCredits
      : Array.isArray(card.credits) ? card.credits
      : Array.isArray(card.benefits) ? card.benefits : []
    for (const c of rawCredits) {
      const description = String(c.description ?? c.name ?? c.title ?? c.label ?? '').trim()
      if (!description) continue
      // Derive a stable credit_type slug from the description
      const credit_type = description
        .toLowerCase()
        .replace(/\$[\d,]+\s*/g, '')
        .replace(/[^a-z\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 50) || 'travel_credit'
      const amountMatch = description.match(/\$([\d,]+)/)
      const amount      = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : (c.amount ? Number(c.amount) : undefined)
      const frequency   = /monthly/i.test(description) ? 'monthly'
        : /annual|yearly/i.test(description) ? 'annual'
        : /once|one.time/i.test(description) ? 'once' : undefined
      credit_rows.push({ credit_type, amount, description, frequency })
    }

    // ── Lounge access ─────────────────────────────────────────────────────────
    const lounge_access_rows: NonNullable<ScrapedOffer['lounge_access_rows']> = []
    if (Array.isArray(card.loungeAccess)) {
      for (const l of card.loungeAccess as any[]) {
        const network = String(l.network ?? l.name ?? l.program ?? '').trim()
        if (!network) continue
        lounge_access_rows.push({
          network,
          visits_per_year: l.visitsPerYear ?? l.visits_per_year ?? undefined,
          guest_policy:    l.guestPolicy   ?? l.guest_policy    ?? undefined,
          details:         l.details       ?? l.description     ?? undefined,
        })
      }
    } else if (typeof card.loungeAccess === 'string' && card.loungeAccess.trim()) {
      lounge_access_rows.push({ network: card.loungeAccess.trim() })
    } else if (card.loungeAccess === true) {
      const network = String(card.airportLoungeNetwork ?? card.loungeNetwork ?? '').trim() || 'Lounge Access'
      lounge_access_rows.push({ network })
    }

    // ── Feature tags → extra_perks ────────────────────────────────────────────
    const tags: string[] = Array.isArray(card.tags) ? card.tags : []
    if (lounge_access_rows.length > 0 && !tags.includes('Lounge Access')) tags.push('Lounge Access')

    return {
      card_name: cardName,
      issuer_slug,
      offer_type:          'welcome_bonus',
      headline:            headline.slice(0, 250),
      details,
      points_value,
      cashback_value,
      spend_requirement,
      spend_timeframe_days,
      extra_perks:         tags.length ? tags.slice(0, 10) : undefined,
      is_limited_time:     !!expires_at,
      expires_at,
      source_url,
      apply_url,
      image_url,
      earn_rate_multipliers: Object.keys(earn_rate_multipliers).length ? earn_rate_multipliers : undefined,
      card_annual_fee,
      card_annual_fee_waived,
      card_supplementary_fee,
      card_foreign_transaction_fee,
      card_min_income,
      card_min_household_income,
      // Extended detail tables
      earn_rate_rows:        earn_rate_rows.length        ? earn_rate_rows        : undefined,
      transfer_partner_rows: transfer_partner_rows.length ? transfer_partner_rows : undefined,
      credit_rows:           credit_rows.length           ? credit_rows           : undefined,
      lounge_access_rows:    lounge_access_rows.length    ? lounge_access_rows    : undefined,
    }
  }

  private parsePeriod(text: string): number | undefined {
    const m = text.match(/(\d+)\s*(month|day)/i)
    if (!m) return undefined
    return m[2].toLowerCase().startsWith('month') ? Number(m[1]) * 30 : Number(m[1])
  }
}

// -----------------------------------------------
// RatehubCards
// robots.txt: Allow (blocks apply pages only)
//
// NOTE: Next.js SPA — tries __NEXT_DATA__ first,
// then falls back to text scan. Upgrade to
// PlaywrightScraper if consistently returning 0.
// -----------------------------------------------
export class RatehubCardsScraper extends BaseScraper {
  name = 'ratehub-cards'
  issuerSlug = 'aggregator'

  private readonly SOURCE_URL = 'https://www.ratehub.ca/credit-cards'

  async scrape(): Promise<ScrapedOffer[]> {
    const res = await this.fetchWithTimeout(this.SOURCE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
    })
    if (!res.ok) {
      console.warn(`[ratehub-cards] HTTP ${res.status} — site may require JS rendering`)
      return []
    }

    const html = await res.text()
    const $ = cheerio.load(html)
    const offers: ScrapedOffer[] = []

    // Try __NEXT_DATA__ embedded JSON
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (m) {
      try {
        this.walkForCards(JSON.parse(m[1]), offers)
      } catch {}
    }

    // Text scan fallback
    if (offers.length === 0) {
      for (const t of scanPageOffers($)) {
        let imgUrl: string | undefined
        $('p, li, h2, h3, h4').each((_, el) => {
          if ($(el).text().replace(/\s+/g, ' ').trim() === t) {
            imgUrl = nearestImg($, el, this.SOURCE_URL)
            return false
          }
        })
        offers.push({
          card_name: inferCardName(t),
          issuer_slug: resolveIssuer(t),
          offer_type: 'welcome_bonus',
          headline: t.slice(0, 250),
          points_value: this.parsePoints(t),
          spend_requirement: this.parseSpend(t)?.amount,
          spend_timeframe_days: this.parseSpend(t)?.days,
          is_limited_time: /limited time|expires/i.test(t),
          source_url: this.SOURCE_URL,
          image_url: imgUrl,
        })
      }
    }

    return offers.filter(o => KNOWN_ISSUER_SLUGS.has(o.issuer_slug))
  }

  private walkForCards(obj: any, acc: ScrapedOffer[], depth = 0): void {
    if (depth > 10 || !obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      // Ratehub card objects typically have welcomeBonus / signupBonus / welcomeOffer
      const first = obj[0]
      if (first?.welcomeBonus || first?.signupBonus || first?.welcomeOffer) {
        for (const card of obj) {
          const headline = String(card.welcomeBonus ?? card.signupBonus ?? card.welcomeOffer ?? '').trim()
          if (!headline) continue
          const rawImg = card.image ?? card.cardImage ?? card.imageUrl ?? card.card_image ?? card.logo ?? card.thumbnailUrl ?? ''
          const image_url = rawImg
            ? (String(rawImg).startsWith('http') ? String(rawImg) : `https://www.ratehub.ca${rawImg}`)
            : undefined
          acc.push({
            card_name: String(card.name ?? card.cardName ?? 'Unknown').trim(),
            issuer_slug: resolveIssuer(String(card.issuerName ?? card.issuer ?? '')),
            offer_type: 'welcome_bonus',
            headline: headline.slice(0, 250),
            points_value: card.bonusPoints ?? this.parsePoints(headline),
            spend_requirement: card.minSpend ?? this.parseSpend(headline)?.amount,
            spend_timeframe_days: this.parseSpend(headline)?.days,
            is_limited_time: !!card.offerExpiry,
            expires_at: card.offerExpiry
              ? this.parseExpiry(`expires ${card.offerExpiry}`)
              : undefined,
            source_url: this.SOURCE_URL,
            image_url: image_url || undefined,
          })
        }
        return
      }
      obj.forEach((v: any) => this.walkForCards(v, acc, depth + 1))
    } else {
      Object.values(obj).forEach((v: any) => this.walkForCards(v, acc, depth + 1))
    }
  }
}


// -----------------------------------------------
// PrinceOfTravel
// robots.txt: Allow: / (blocks /account/ /api/ /dev/ only)
//
// Strategy:
//   1. Fetch /credit-cards/ listing page, collect all individual card URLs
//      (links matching /credit-cards/{slug}/).
//   2. Visit each card page with a 2-second polite delay.
//   3. On each card page, extract:
//        • card name (h1 or first prominent heading)
//        • card image URL (first prominent img in main content)
//        • apply / referral link (first external "Apply" anchor)
//        • welcome offer headline + bullet breakdown
//        • expiry date, points value, spend requirement
//        • earn-rate multipliers (e.g. 3x dining, 2x groceries)
//   4. Offers are written to card_offers; images and earn_rate_multipliers
//      are written to credit_cards (only when currently NULL).
//
// HTML note: server-rendered Next.js App Router.  Content is fully
// present in the raw HTML response — no headless browser needed.
// -----------------------------------------------
export class PrinceOfTravelScraper extends BaseScraper {
  name = 'princeoftravel'
  issuerSlug = 'aggregator'
  // Priority 1: richest data source — scrapes every card page individually,
  // capturing images, earn-rate multipliers, expiry dates, and full offer breakdowns.
  protected sourcePriority = 1   // curated editorial — highest trust
  protected sourceName     = 'princeoftravel'
  protected isVerified = true

  private readonly BASE_URL  = 'https://princeoftravel.com'
  private readonly LISTING_URL = 'https://princeoftravel.com/credit-cards/'

  // ── Non-card paths to exclude when collecting card URLs ──────────────────
  private readonly SKIP_SLUGS = new Set([
    'travel', 'cash-back', 'cashback', 'business', 'hotel', 'airline',
    'no-fee', 'no-annual-fee', 'premium', 'best', 'compare', 'rewards',
    'points', 'miles', 'featured', 'all', 'reviews', 'news', 'guides',
  ])

  async scrape(): Promise<ScrapedOffer[]> {
    // Step 1 — collect card URLs from the listing page
    const cardUrls = await this.fetchCardUrls()
    console.log(`[princeoftravel] Found ${cardUrls.length} card URLs on listing page`)

    const offers: ScrapedOffer[] = []

    // Step 2 — scrape each individual card page
    for (let i = 0; i < cardUrls.length; i++) {
      const url = cardUrls[i]
      try {
        const offer = await this.scrapeCardPage(url)
        if (offer) offers.push(offer)
      } catch (err) {
        console.warn(`[princeoftravel] Failed to scrape ${url}: ${err}`)
      }
      // Polite delay between card page requests
      if (i < cardUrls.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    const filtered = offers.filter(o => KNOWN_ISSUER_SLUGS.has(o.issuer_slug))
    console.log(`[princeoftravel] found ${offers.length} offers, ${filtered.length} with known issuers`)
    return filtered
  }

  // ── Listing page: collect individual card page URLs ───────────────────────
  private async fetchCardUrls(): Promise<string[]> {
    const res = await this.fetchWithTimeout(this.LISTING_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status} on listing page`)

    const html = await res.text()
    const $ = cheerio.load(html)
    const urls = new Set<string>()

    // Strategy 1: parse HTML anchor hrefs
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      const m = href.match(/^\/credit-cards\/([^/?#]+)\/?$/)
      if (!m) return
      const slug = m[1].toLowerCase()
      if (!this.SKIP_SLUGS.has(slug)) {
        urls.add(`${this.BASE_URL}/credit-cards/${slug}/`)
      }
    })

    // Strategy 2: scan RSC/JSON payload embedded in page for card paths
    // PoT App Router inlines RSC chunks as __next_f.push([1, "..."]) calls
    if (urls.size < 5) {
      const pathRe = /\/credit-cards\/([a-z0-9][a-z0-9-]{6,80})\//g
      let m: RegExpExecArray | null
      while ((m = pathRe.exec(html)) !== null) {
        const slug = m[1]
        if (!this.SKIP_SLUGS.has(slug)) {
          urls.add(`${this.BASE_URL}/credit-cards/${slug}/`)
        }
      }
    }

    return [...urls]
  }

  // ── Individual card page ──────────────────────────────────────────────────
  private async scrapeCardPage(url: string): Promise<ScrapedOffer | null> {
    const res = await this.fetchWithTimeout(url)
    if (!res.ok) {
      console.warn(`[princeoftravel] HTTP ${res.status} for ${url}`)
      return null
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    // ── Card name ─────────────────────────────────────────────────────────
    const cardName = (
      $('h1').first().text().trim() ||
      $('title').text().split(/[|–\-]/)[0].trim()
    )
      .replace(/[^\x20-\x7E]+/g, ' ')   // strip non-ASCII: ® ™ © etc.
      .replace(/\s*\bReview\b.*$/i, '')  // strip " Review" suffix and anything after
      .replace(/\s+/g, ' ')
      .trim()

    if (!cardName || cardName.length < 5) return null

    const issuer_slug = resolveIssuer(cardName)
    if (!KNOWN_ISSUER_SLUGS.has(issuer_slug)) return null

    // ── Card image ────────────────────────────────────────────────────────
    let image_url: string | undefined
    const urlSlug = url.split('/').filter(Boolean).pop() ?? ''
    $('main img, article img, section img, div[class*="hero"] img, div[class*="card"] img').each((_, img) => {
      if (image_url) return
      const src = $(img).attr('src') ?? $(img).attr('data-src') ?? ''
      if (!src || src.startsWith('data:') || src.includes('logo') || src.includes('icon')) return
      const w = parseInt($(img).attr('width') ?? '0')
      if (w && w < 80) return
      image_url = src.startsWith('http') ? src : `${this.BASE_URL}${src}`
    })
    if (!image_url) {
      $('img').each((_, img) => {
        if (image_url) return
        const src = $(img).attr('src') ?? ''
        if (!src || src.startsWith('data:')) return
        if (src.includes(urlSlug) || /card|credit/i.test($(img).attr('alt') ?? '')) {
          image_url = src.startsWith('http') ? src : `${this.BASE_URL}${src}`
        }
      })
    }

    // ── Apply link ────────────────────────────────────────────────────────
    let apply_url: string | undefined
    $('a').each((_, a) => {
      if (apply_url) return
      const href = $(a).attr('href') ?? ''
      const text = $(a).text().trim().toLowerCase()
      if (!href || href.startsWith('#')) return
      if (
        text === 'apply now' || text === 'apply' ||
        /apply[\s-]?now/i.test(text) ||
        href.includes('/apply') || href.includes('referral')
      ) {
        apply_url = href.startsWith('http') ? href : `${this.BASE_URL}${href}`
      }
    })
    if (!apply_url) apply_url = url

    // ── Annual fee + first-year rebate + supplementary fee ────────────────
    // Primary: scan Bonuses & Fees table rows (TIER/AMOUNT cols, FEES rows)
    let card_annual_fee: number | undefined
    let card_annual_fee_waived: boolean | undefined
    let card_supplementary_fee: number | undefined

    $('table tr').each((_, tr) => {
      const cells = $(tr).find('td, th').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
      if (cells.length < 2) return
      const label = cells[0].toLowerCase()
      const value = cells[1]

      if (/annual\s*fee/i.test(label) && !/additional|supplementary/i.test(label) && card_annual_fee == null) {
        if (/no\s*(?:annual\s*)?fee|free|\$?0\b/i.test(value)) {
          card_annual_fee = 0
        } else {
          const m = value.match(/\$?([\d,]+)/)
          if (m) card_annual_fee = parseInt(m[1].replace(/,/g, ''))
        }
      }

      if (/first.year|first-year|annual\s*fee\s*rebate|waived/i.test(label) && card_annual_fee_waived == null) {
        // If the value mentions a dollar amount or "rebate" / "free", it's waived
        if (/\$[\d,]+|rebate|free|waived/i.test(value)) {
          card_annual_fee_waived = true
        }
      }

      if (/additional\s*card|supplementary/i.test(label) && card_supplementary_fee == null) {
        if (/no\s*fee|free|\$?0\b/i.test(value)) {
          card_supplementary_fee = 0
        } else {
          const m = value.match(/\$?([\d,]+)/)
          if (m) card_supplementary_fee = parseInt(m[1].replace(/,/g, ''))
        }
      }
    })

    // ── Card-level fields from table rows ─────────────────────────────────
    // Declare here so the table scanner and body-text fallbacks can both populate them.
    let card_min_income: number | undefined
    let card_min_household_income: number | undefined
    let card_foreign_transaction_fee: number | null | undefined

    $('table tr').each((_, tr) => {
      const cells = $(tr).find('td, th').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
      if (cells.length < 2) return
      const label = cells[0].toLowerCase()
      const value = cells[1]

      // Personal / minimum income row
      if (/minimum\s+(?:personal\s+)?income|personal\s+income/i.test(label) && card_min_income == null) {
        const m = value.match(/\$?([\d,]+)/)
        if (m) card_min_income = parseInt(m[1].replace(/,/g, ''))
      }

      // Household income row (separate from personal income row)
      if (/household\s+income/i.test(label) && card_min_household_income == null) {
        const m = value.match(/\$?([\d,]+)/)
        if (m) card_min_household_income = parseInt(m[1].replace(/,/g, ''))
      }

      // Foreign transaction fee row
      if (/foreign\s+(?:transaction\s+)?fee|fx\s+fee/i.test(label) && card_foreign_transaction_fee == null) {
        if (/no\s*fee|free|\$?0\b|0%/i.test(value) || /none/i.test(value)) {
          card_foreign_transaction_fee = 0
        } else {
          const m = value.match(/([\d.]+)\s*%/)
          if (m) card_foreign_transaction_fee = parseFloat(m[1])
        }
      }
    })

    // Fallback: scan body text for annual fee
    if (card_annual_fee == null) {
      $('p, li, span').each((_, el) => {
        if (card_annual_fee != null) return
        if ($(el).children('p, li').length > 2) return  // skip containers
        const t = $(el).text().replace(/\s+/g, ' ').trim()
        if (!/annual\s*fee/i.test(t)) return
        if (/no\s*(?:annual\s*)?fee/i.test(t)) {
          card_annual_fee = 0
        } else {
          const m = t.match(/\$?([\d,]+)/)
          if (m) card_annual_fee = parseInt(m[1].replace(/,/g, ''))
        }
      })
    }

    // ── Body-text fallbacks for income + FX fee (table scanner above runs first) ──
    const bodyText = $('body').text().replace(/\s+/g, ' ')

    // Scan full body text for "first year free / rebate" signals
    if (card_annual_fee_waived == null) {
      if (/first.year\s*(?:free|rebate|waived)|annual\s*fee\s*waived\s*(?:in\s*the\s*)?first\s*year/i.test(bodyText) ||
          /First\s*Year\s*Rebate/i.test(bodyText)) {
        card_annual_fee_waived = true
      }
    }

    // Fallback: PoT format "Minimum income: $80,000 personal or $150,000 household"
    // Extract both values from the same line in one pass.
    if (card_min_income == null || card_min_household_income == null) {
      const incomeMatch = bodyText.match(
        /minimum\s+income[:\s]+\$?\s*([\d,]+)[^$\n]{0,100}\$?\s*([\d,]+)\s+household/i
      )
      if (incomeMatch) {
        if (card_min_income == null) card_min_income = parseInt(incomeMatch[1].replace(/,/g, ''))
        if (card_min_household_income == null) card_min_household_income = parseInt(incomeMatch[2].replace(/,/g, ''))
      } else {
        // Personal-only format: "Minimum income: $60,000"
        const personalMatch = bodyText.match(/minimum\s+income[:\s]+\$?\s*([\d,]+)/i)
        if (personalMatch && card_min_income == null) card_min_income = parseInt(personalMatch[1].replace(/,/g, ''))
      }
    }

    // Fallback: "no foreign transaction fee" → 0
    if (card_foreign_transaction_fee == null &&
        /no\s+(?:foreign\s+)?(?:transaction\s+)?fee|no\s+fx\s+fee|\bno\s+fx\b/i.test(bodyText)) {
      card_foreign_transaction_fee = 0
    }

    // ── Debug: log all table headers before per-table matching ───────────────
    const cardSlug = url.replace(/.*\/credit-cards\//, '').replace(/\/$/, '')
    const allTables: { headers: string[] }[] = []
    $('table').each((_, table) => {
      const headers = $(table).find('tr').first().find('th, td')
        .map((_, th) => $(th).text().trim().toLowerCase()).get()
      allTables.push({ headers })
    })
    const headersFound = allTables.map(t => t.headers)
    console.log(`[pot-debug] ${cardSlug} all tables found:`, headersFound)

    // ── Insurance coverage table ──────────────────────────────────────────
    // PoT actual headers (all-caps in HTML, lowercased here): COVERAGE | MAXIMUM | DETAILS
    const insurance_rows: NonNullable<ScrapedOffer['insurance_rows']> = []
    $('table').each((_, table) => {
      const $table = $(table)
      const headers = $table.find('tr').first().find('th, td')
        .map((_, th) => $(th).text().trim().toLowerCase()).get()
      // Exact match on "coverage" (PoT) with broad fallback for other sites.
      const covIdx = headers.findIndex(h => h === 'coverage' || /\bcoverage type\b|\binsurance\b/i.test(h))
      if (covIdx === -1) return
      // Skip earn-rate, transfer-partner, and fee tables.
      if (headers.some(h => /\bcategory\b|\bpartner\b|\bratio\b|\bpoints per\b/i.test(h))) return
      const maxIdx = headers.findIndex(h => h === 'maximum' || /^max\b|^amount|^limit/i.test(h))
      const detIdx = headers.findIndex(h => h === 'details' || /^detail|^description|^note/i.test(h))

      $table.find('tr').slice(1).each((_, tr) => {
        const cells = $(tr).find('td, th').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
        const coverage_type = cells[covIdx]
        if (!coverage_type || coverage_type.length < 3) return
        insurance_rows.push({
          coverage_type,
          maximum: maxIdx !== -1 ? cells[maxIdx] || undefined : undefined,
          details: detIdx !== -1 ? cells[detIdx] || undefined : undefined,
        })
      })
    })

    // ── Transfer partners table ───────────────────────────────────────────
    // PoT actual headers: PARTNER | RATIO | TRANSFER TIME
    // Section: "Redeeming Rewards" → sub-heading "TRANSFER PARTNERS"
    const transfer_partner_rows: NonNullable<ScrapedOffer['transfer_partner_rows']> = []
    $('table').each((_, table) => {
      const $table = $(table)
      const headers = $table.find('tr').first().find('th, td')
        .map((_, th) => $(th).text().trim().toLowerCase()).get()
      // Exact match on "partner" (PoT) with broad fallback.
      const partnerIdx = headers.findIndex(h => h === 'partner' || /\bpartner\b|\bprogram\b/i.test(h))
      if (partnerIdx === -1) return
      // Skip insurance, earn-rate, and fee tables.
      if (headers.some(h => /coverage|insurance|\bcategory\b|annual\s*fee|interest/i.test(h))) return
      // Use exact "ratio" match first to avoid hitting "transfer time" column.
      const ratioIdx = headers.findIndex(h => h === 'ratio' || /^transfer ratio$/i.test(h))
      const timeIdx  = headers.findIndex(h => /transfer\s*time|^time$/i.test(h))

      $table.find('tr').slice(1).each((_, tr) => {
        const cells = $(tr).find('td, th').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
        const partner_name = cells[partnerIdx]
        if (!partner_name || partner_name.length < 2) return
        transfer_partner_rows.push({
          partner_name,
          transfer_ratio: ratioIdx !== -1 ? cells[ratioIdx] || undefined : undefined,
          transfer_time:  timeIdx  !== -1 ? cells[timeIdx]  || undefined : undefined,
        })
      })
    })
    if (transfer_partner_rows.length === 0) console.log(`[pot-debug] ${cardSlug} no transfer_partners — headers seen:`, headersFound)

    // ── Interest rates ────────────────────────────────────────────────────
    let card_purchase_rate: number | undefined
    let card_cash_advance_rate: number | undefined
    let card_balance_transfer_rate: number | undefined

    $('table tr').each((_, tr) => {
      const cells = $(tr).find('td, th').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
      if (cells.length < 2) return
      const label = cells[0].toLowerCase()
      const value = cells.slice(1).join(' ')
      const rateMatch = value.match(/([\d.]+)\s*%/)
      if (!rateMatch) return
      const rate = parseFloat(rateMatch[1])
      if (rate <= 0 || rate > 100) return

      if (/purchase|standard/i.test(label) && !/cash|balance/i.test(label) && card_purchase_rate == null)
        card_purchase_rate = rate
      else if (/cash\s*advance/i.test(label) && card_cash_advance_rate == null)
        card_cash_advance_rate = rate
      else if (/balance\s*transfer/i.test(label) && card_balance_transfer_rate == null)
        card_balance_transfer_rate = rate
    })

    // ── Earn-rate multipliers ─────────────────────────────────────────────
    const earn_rate_multipliers: Record<string, number> = {}
    const earn_rate_rows: NonNullable<ScrapedOffer['earn_rate_rows']> = []

    // Strategy A: Earning Rewards table (CATEGORY / RATE columns)
    // PoT actual headers: CATEGORY | RATE | CAP | AFTER CAP
    $('table').each((_, table) => {
      const $table = $(table)
      const headerCells = $table.find('tr').first().find('th, td').map((_, th) => $(th).text().trim().toLowerCase()).get()
      // Exact match on "category" and "rate" (PoT) with broad fallback.
      const catIdx  = headerCells.findIndex(h => h === 'category' || /^category\b/i.test(h))
      const rateIdx = headerCells.findIndex(h => h === 'rate'     || /^rate\b/i.test(h))
      if (catIdx === -1 || rateIdx === -1) return
      // Skip insurance and transfer-partner tables that accidentally have these columns.
      if (headerCells.some(h => /coverage|insurance|\bpartner\b|\bratio\b/i.test(h))) return

      $table.find('tr').slice(1).each((_, tr) => {
        const cells = $(tr).find('td').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
        if (!cells[catIdx] || !cells[rateIdx]) return
        const category    = cells[catIdx].trim()
        const rate_text   = cells[rateIdx].trim()
        const slugCategory = category.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '').replace(/_+/g, '_')
        const rateMatch = rate_text.match(/(\d+(?:\.\d+)?)/)
        if (rateMatch && slugCategory && slugCategory.length >= 3) {
          const rate = parseFloat(rateMatch[1])
          if (rate >= 1 && rate <= 30 && !earn_rate_multipliers[slugCategory]) {
            earn_rate_multipliers[slugCategory] = rate
            earn_rate_rows.push({ category, rate, rate_text })
          }
        }
      })
    })

    // Strategy B: text-based earn rate lines
    if (Object.keys(earn_rate_multipliers).length === 0) {
      $('li, p, td, span').each((_, el) => {
        if ($(el).children('li, p, td').length > 0) return
        const text = $(el).text().replace(/\s+/g, ' ').trim()
        const re = /(?:earn\s+)?(\d+(?:\.\d+)?)\s*(?:x|pts?|points?|miles?)\s*(?:per\s*\$1\s*)?(?:on|for|at|in)\s+([a-z &]+?)(?:\s*\.|,|;|—|$)/gi
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const rate = parseFloat(m[1])
          const rawCat = m[2].trim()
          const category = rawCat.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
          if (category && rate >= 1 && rate <= 30 && !earn_rate_multipliers[category]) {
            earn_rate_multipliers[category] = rate
            earn_rate_rows.push({ category: rawCat, rate, rate_text: `${m[1]}x on ${rawCat}` })
          }
        }
      })
    }
    if (earn_rate_rows.length === 0) console.log(`[pot-debug] ${cardSlug} no earn_rates — headers seen:`, headersFound)

    // ── Welcome offer section ─────────────────────────────────────────────
    let headline = ''
    const bulletPoints: string[] = []
    let expires_at: string | undefined
    let points_value: number | undefined
    let cashback_value: number | undefined
    let spend_requirement: number | undefined
    let spend_timeframe_days: number | undefined

    // Strategy A: heading labelled "Welcome Offer" / "Welcome Bonus"
    $('h2, h3, h4, h5').each((_, heading) => {
      const headingText = $(heading).text().trim()
      if (!/welcome\s*(offer|bonus)/i.test(headingText)) return

      let $el = $(heading).next()
      let gathered = 0
      while ($el.length && gathered < 10) {
        const tag = ($el[0] as any).tagName?.toLowerCase() ?? ''
        if (/^h[1-6]$/.test(tag)) break
        if (tag === 'ul' || tag === 'ol') {
          $el.find('li').each((_, li) => {
            const t = $(li).text().replace(/\s+/g, ' ').trim()
            if (t) bulletPoints.push(t)
          })
          gathered++
        } else if (tag === 'p' || tag === 'div') {
          const t = $el.text().replace(/\s+/g, ' ').trim()
          if (t.length > 10) { bulletPoints.push(t); gathered++ }
        }
        $el = $el.next()
      }
    })

    // Strategy B: "Welcome bonus" label <span>
    if (bulletPoints.length === 0) {
      $('span, p, div').each((_, el) => {
        if (headline) return
        const text = $(el).text().trim()
        if (/^welcome\s*(bonus|offer)$/i.test(text)) {
          const nextText = $(el).next().text().replace(/\s+/g, ' ').trim()
          if (nextText) headline = nextText
        }
      })
    }

    // Strategy C: page-wide text scan
    if (bulletPoints.length === 0 && !headline) {
      scanPageOffers($).forEach(t => bulletPoints.push(t))
    }

    // ── Parse values from bullet points ──────────────────────────────────
    // Take MAX points value (welcome bonus is always the largest number).
    let maxPoints: number | undefined
    let maxCash: number | undefined
    for (const bullet of bulletPoints) {
      const v = this.parsePoints(bullet)
      if (v != null && (maxPoints == null || v > maxPoints)) maxPoints = v

      // Cashback: "$250 cash back", "$200 cashback"
      const cashMatch = bullet.match(/\$([\d,]+)\s*cash\s*back/i)
      if (cashMatch) {
        const cv = parseFloat(cashMatch[1].replace(/,/g, ''))
        if (!maxCash || cv > maxCash) maxCash = cv
      }

      if (!spend_requirement) {
        const s = this.parseSpend(bullet)
        if (s) { spend_requirement = s.amount; spend_timeframe_days = s.days }
      }
      if (!expires_at && /expir|valid until|offer ends/i.test(bullet)) {
        expires_at = this.parseExpiry(bullet)
      }
    }
    points_value = maxPoints
    cashback_value = maxCash

    // Build headline from first meaningful bullet or label span
    if (!headline) headline = bulletPoints[0] ?? ''
    if (!headline) headline = cardName

    // Pick up values from headline if bullets were empty
    if (!points_value) points_value = this.parsePoints(headline)
    if (!cashback_value) {
      const cashMatch = headline.match(/\$([\d,]+)\s*cash\s*back/i)
      if (cashMatch) cashback_value = parseFloat(cashMatch[1].replace(/,/g, ''))
    }
    if (!spend_requirement) {
      const s = this.parseSpend(headline)
      if (s) { spend_requirement = s.amount; spend_timeframe_days = s.days }
    }

    if (!headline || headline.length < 5) return null

    console.log(`[pot-phase2] ${cardSlug} insurance=${insurance_rows.length} earn_rates=${earn_rate_rows.length} transfer_partners=${transfer_partner_rows.length}`)

    return {
      card_name: cardName,
      issuer_slug,
      offer_type: 'welcome_bonus',
      headline: headline.slice(0, 250),
      details: bulletPoints.length > 1
        ? bulletPoints.join(' • ').slice(0, 1000)
        : undefined,
      points_value,
      cashback_value,
      spend_requirement,
      spend_timeframe_days,
      extra_perks: bulletPoints.length > 1 ? bulletPoints.slice(1, 6) : undefined,
      is_limited_time: !!expires_at,
      expires_at,
      source_url: url,
      apply_url,
      image_url,
      earn_rate_multipliers: Object.keys(earn_rate_multipliers).length
        ? earn_rate_multipliers
        : undefined,
      card_annual_fee,
      card_annual_fee_waived,
      card_supplementary_fee,
      card_foreign_transaction_fee,
      card_min_income,
      card_min_household_income,
      // Extended detail tables
      insurance_rows:        insurance_rows.length        ? insurance_rows        : undefined,
      earn_rate_rows:        earn_rate_rows.length        ? earn_rate_rows        : undefined,
      transfer_partner_rows: transfer_partner_rows.length ? transfer_partner_rows : undefined,
      card_purchase_rate,
      card_cash_advance_rate,
      card_balance_transfer_rate,
    }
  }
}

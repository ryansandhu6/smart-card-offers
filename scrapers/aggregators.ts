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
// Strategy: parse JSON-LD CollectionPage/ItemList
// embedded in the Next.js page. Each card object has:
//   title, issuer, signupBonus, signupBonusValue,
//   minSpendRequired, minSpendPeriod, signupBonusExpiry
// Falls back to __NEXT_DATA__ recursive walk if
// JSON-LD yields nothing.
// -----------------------------------------------
export class MintFlyingScraper extends BaseScraper {
  name = 'mintflying'
  issuerSlug = 'aggregator'
  protected sourcePriority = 3   // aggregator — lowest trust tier
  protected isVerified = false

  private readonly SOURCE_URL = 'https://www.mintflying.com/credit-cards'

  async scrape(): Promise<ScrapedOffer[]> {
    const res = await this.fetchWithTimeout(this.SOURCE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const html = await res.text()
    const $ = cheerio.load(html)
    const offers: ScrapedOffer[] = []

    // Strategy 1: JSON-LD CollectionPage / ItemList blocks
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        offers.push(...this.extractFromSchema(JSON.parse($(el).html() ?? '')))
      } catch {}
    })

    // Strategy 2: Next.js App Router streams data via __next_f.push([type, payload])
    // Type-1 chunks carry the RSC/JSON payload as a string
    if (offers.length === 0) {
      const chunks: string[] = []
      const chunkRe = /\.__next_f\.push\(\[1\s*,\s*"((?:[^"\\]|\\.)*)"\]\)/g
      let m: RegExpExecArray | null
      while ((m = chunkRe.exec(html)) !== null) {
        try { chunks.push(JSON.parse(`"${m[1]}"`) ) } catch {}
      }
      const combined = chunks.join('')
      offers.push(...this.extractFromRscPayload(combined))
    }

    // Strategy 3: Brute-force — find every JSON object in the page that has
    // a signupBonus field by scanning for the key and extracting surrounding JSON
    if (offers.length === 0) {
      offers.push(...this.extractByKeywordScan(html))
    }

    const filtered = offers.filter(o => KNOWN_ISSUER_SLUGS.has(o.issuer_slug))
    console.log(`[mintflying] found ${offers.length} offers, ${filtered.length} with known issuers`)
    return filtered
  }

  /** Parse RSC payload string — extract arrays/objects containing signupBonus */
  private extractFromRscPayload(payload: string): ScrapedOffer[] {
    const offers: ScrapedOffer[] = []
    // RSC lines start with an id prefix like "a:..." or just bare JSON
    // Split on RSC record boundaries and try parsing each piece
    const lines = payload.split(/\n(?=[0-9a-f]+:)/)
    for (const line of lines) {
      const jsonStart = line.indexOf(':') + 1
      const raw = line.slice(jsonStart).trim()
      if (!raw.startsWith('{') && !raw.startsWith('[')) continue
      try {
        const parsed = JSON.parse(raw)
        offers.push(...this.walkNextData(parsed))
      } catch {}
    }
    return offers
  }

  /** Scan raw HTML for signupBonus occurrences and extract enclosing JSON objects */
  private extractByKeywordScan(html: string): ScrapedOffer[] {
    const offers: ScrapedOffer[] = []
    const seen = new Set<string>()
    let pos = 0
    while (true) {
      const idx = html.indexOf('"signupBonus"', pos)
      if (idx === -1) break
      pos = idx + 1

      // Walk back to find the opening { of the enclosing object
      let start = idx
      let depth = 0
      for (let i = idx; i >= Math.max(0, idx - 2000); i--) {
        if (html[i] === '}') depth++
        if (html[i] === '{') {
          if (depth === 0) { start = i; break }
          depth--
        }
      }
      // Walk forward to find closing }
      let end = idx
      depth = 0
      for (let i = start; i < Math.min(html.length, start + 3000); i++) {
        if (html[i] === '{') depth++
        if (html[i] === '}') {
          depth--
          if (depth === 0) { end = i + 1; break }
        }
      }

      const candidate = html.slice(start, end)
      if (seen.has(candidate)) continue
      seen.add(candidate)

      try {
        const card = JSON.parse(candidate)
        if (card.signupBonus && (card.title || card.name)) {
          const offer = this.cardToOffer(card)
          if (offer) offers.push(offer)
        }
      } catch {}
    }
    return offers
  }

  private extractFromSchema(json: any): ScrapedOffer[] {
    if (Array.isArray(json)) return json.flatMap(j => this.extractFromSchema(j))

    const type: string = json['@type'] ?? ''

    // Unwrap CollectionPage / ItemList containers
    if (type === 'ItemList' || type === 'CollectionPage') {
      const list = json.itemListElement ?? json.mainEntity?.itemListElement ?? []
      return list.flatMap((entry: any) => this.extractFromSchema(entry.item ?? entry))
    }

    // Individual card-like objects
    if (json.signupBonus || json.signupBonusValue || json.title) {
      const offer = this.cardToOffer(json)
      return offer ? [offer] : []
    }

    return []
  }

  private cardToOffer(card: any): ScrapedOffer | null {
    const headline = String(card.signupBonus ?? card.description ?? '').trim()
    const cardName = String(card.title ?? card.name ?? '').trim()
    if (!headline || !cardName) return null

    const issuer_slug = resolveIssuer(String(card.issuer ?? card.brand ?? ''))
    const points_value: number | undefined =
      typeof card.signupBonusValue === 'number'
        ? card.signupBonusValue
        : this.parsePoints(headline)

    const periodDays = this.parsePeriod(String(card.minSpendPeriod ?? ''))
    const spendFromText = this.parseSpend(headline)
    const spend_requirement: number | undefined =
      card.minSpendRequired != null ? Number(card.minSpendRequired) : spendFromText?.amount
    const spend_timeframe_days: number | undefined = periodDays ?? spendFromText?.days

    const expires_at = card.signupBonusExpiry
      ? this.parseExpiry(`expires ${card.signupBonusExpiry}`)
      : undefined

    const image_url = this.resolveImageUrl(card.cardImage ?? card.image ?? card.imageUrl ?? '')

    return {
      card_name: cardName,
      issuer_slug,
      offer_type: 'welcome_bonus',
      headline: headline.slice(0, 250),
      points_value,
      spend_requirement,
      spend_timeframe_days,
      is_limited_time: !!expires_at,
      expires_at,
      source_url: String(card.url ?? this.SOURCE_URL),
      apply_url: String(card.applyUrl ?? card.url ?? this.SOURCE_URL),
      image_url: image_url || undefined,
    }
  }

  /** Recursively search __NEXT_DATA__ for arrays of card-like objects */
  private walkNextData(obj: any, depth = 0): ScrapedOffer[] {
    if (depth > 12 || obj == null || typeof obj !== 'object') return []
    if (Array.isArray(obj)) {
      if (obj.length > 0 && (obj[0]?.signupBonus != null || obj[0]?.signupBonusValue != null)) {
        return obj.flatMap((c: any) => {
          const o = this.cardToOffer(c)
          return o ? [o] : []
        })
      }
      return obj.flatMap((v: any) => this.walkNextData(v, depth + 1))
    }
    return Object.values(obj).flatMap((v: any) => this.walkNextData(v, depth + 1))
  }

  private parsePeriod(text: string): number | undefined {
    const m = text.match(/(\d+)\s*(month|day)/i)
    if (!m) return undefined
    return m[2].toLowerCase().startsWith('month') ? Number(m[1]) * 30 : Number(m[1])
  }

  private resolveImageUrl(raw: string): string {
    if (!raw) return ''
    if (raw.startsWith('http')) return raw
    if (raw.startsWith('/')) return `https://www.mintflying.com${raw}`
    return ''
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
  protected sourcePriority = 1
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
      // 2-second polite delay between card page requests
      if (i < cardUrls.length - 1) {
        await new Promise(r => setTimeout(r, 2_000))
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
      $('title').text().split(/[|–-]/)[0].trim()
    ).replace(/\s+/g, ' ')
    if (!cardName || cardName.length < 5) return null

    const issuer_slug = resolveIssuer(cardName)
    if (!KNOWN_ISSUER_SLUGS.has(issuer_slug)) return null

    // ── Card image ────────────────────────────────────────────────────────
    // PoT renders the card art in the hero section. Skip tiny icons / logos.
    let image_url: string | undefined
    // Prefer <img> whose src contains the card slug or "card" keyword
    const urlSlug = url.split('/').filter(Boolean).pop() ?? ''
    $('main img, article img, section img, div[class*="hero"] img, div[class*="card"] img').each((_, img) => {
      if (image_url) return
      const src = $(img).attr('src') ?? $(img).attr('data-src') ?? ''
      if (!src || src.startsWith('data:') || src.includes('logo') || src.includes('icon')) return
      const w = parseInt($(img).attr('width') ?? '0')
      if (w && w < 80) return // skip tiny thumbnails
      image_url = src.startsWith('http') ? src : `${this.BASE_URL}${src}`
    })
    // Fallback: first img in the page body that looks like a card
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
    // If no explicit apply link, use the PoT card page itself as the source
    if (!apply_url) apply_url = url

    // ── Welcome offer section ─────────────────────────────────────────────
    let headline = ''
    const bulletPoints: string[] = []
    let expires_at: string | undefined
    let points_value: number | undefined
    let spend_requirement: number | undefined
    let spend_timeframe_days: number | undefined

    // Strategy A: find heading labelled "Welcome Offer" / "Welcome Bonus",
    // then harvest the following <ul>/<ol>/<p> siblings.
    $('h2, h3, h4, h5').each((_, heading) => {
      const headingText = $(heading).text().trim()
      if (!/welcome\s*(offer|bonus)/i.test(headingText)) return

      // Walk siblings until the next heading
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

    // Strategy B: look for "Welcome bonus" label <span> (same pattern as the
    // /best-credit-cards/ pages — cards appear twice, deduplication not needed
    // here since we are on a single-card page).
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

    // Strategy C: page-wide text scan looking for offer-keyword sentences
    if (bulletPoints.length === 0 && !headline) {
      scanPageOffers($).forEach(t => bulletPoints.push(t))
    }

    // ── Parse values out of bullet points ────────────────────────────────
    for (const bullet of bulletPoints) {
      if (!points_value) points_value = this.parsePoints(bullet)
      if (!spend_requirement) {
        const s = this.parseSpend(bullet)
        if (s) { spend_requirement = s.amount; spend_timeframe_days = s.days }
      }
      if (!expires_at && /expir|valid until|offer ends/i.test(bullet)) {
        expires_at = this.parseExpiry(bullet)
      }
    }

    // Build headline: first meaningful bullet, or the value from the label span
    if (!headline) {
      headline = bulletPoints[0] ?? ''
    }
    if (!headline) headline = cardName // last resort

    // Pick up points / spend from headline too if bullets were empty
    if (!points_value) points_value = this.parsePoints(headline)
    if (!spend_requirement) {
      const s = this.parseSpend(headline)
      if (s) { spend_requirement = s.amount; spend_timeframe_days = s.days }
    }

    // ── Earn-rate multipliers ─────────────────────────────────────────────
    // Look for leaf text nodes that describe per-category earn rates,
    // e.g. "Earn 3 points per $1 on dining" or "3x points on groceries"
    const earn_rate_multipliers: Record<string, number> = {}
    $('li, p, td, span').each((_, el) => {
      // Only process leaf / near-leaf nodes to avoid double-counting parents
      if ($(el).children('li, p, td').length > 0) return
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      // Match patterns like "3x points on dining" or "Earn 5 points per $1 on travel"
      const re = /(?:earn\s+)?(\d+(?:\.\d+)?)\s*(?:x|pts?|points?|miles?)\s*(?:per\s*\$1\s*)?(?:on|for|at|in)\s+([a-z &]+?)(?:\s*\.|,|;|—|$)/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const rate = parseFloat(m[1])
        const category = m[2].trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
        if (category && rate >= 1 && rate <= 30 && !earn_rate_multipliers[category]) {
          earn_rate_multipliers[category] = rate
        }
      }
    })

    if (!headline || headline.length < 5) return null

    return {
      card_name: cardName,
      issuer_slug,
      offer_type: 'welcome_bonus',
      headline: headline.slice(0, 250),
      details: bulletPoints.length > 1
        ? bulletPoints.join(' • ').slice(0, 1000)
        : undefined,
      points_value,
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
    }
  }
}

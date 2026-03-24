// scrapers/banks.ts
// Bank-direct scrapers for Scotiabank, BMO, RBC, CIBC.
// Strategy: try to scrape live offer text from each card's product page.
// If the URL returns an error or no usable text is found, fall back to the
// hardcoded `known` map — so we always emit an offer even when banks
// change their URL structure.

import * as cheerio from 'cheerio'
import { BaseScraper } from '../lib/scraper-base'
import type { ScrapedOffer } from '../types'

// -----------------------------------------------
// Shared aggressive offer text extractor.
// -----------------------------------------------
const OFFER_KW = /points?|cash\s*back|bonus|earn|miles?|reward|Scene\+|Aeroplan|BMO\s*Rewards|Aventura|Avion|WestJet|AIR\s*MILES/i
const HAS_NUM  = /\$[\d,]+|[\d,]+\s*(?:points?|miles?)|[\d.]+\s*%/i

function findOfferText($: cheerio.CheerioAPI): string {
  let best = ''
  $('p, li, h2, h3, h4, span, div').each((_, el) => {
    const t = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim()
    if (t.length < 20 || t.length > 400) return
    if (OFFER_KW.test(t) && HAS_NUM.test(t) && t.length > best.length) best = t
  })
  if (!best) {
    $('p, li').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim()
      if (t.length < 20 || t.length > 400) return
      if (OFFER_KW.test(t) && HAS_NUM.test(t) && t.length > best.length) best = t
    })
  }
  return best
}

// -----------------------------------------------
// Scotiabank
// -----------------------------------------------
export class ScotiabankScraper extends BaseScraper {
  name = 'scotiabank-canada'
  issuerSlug = 'scotiabank'
  protected sourcePriority = 1
  protected isVerified = true

  private cards = [
    {
      name: 'Scotiabank Passport™ Visa Infinite* Card',
      url: 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/passport-infinite-card.html',
    },
    {
      name: 'Scotia Momentum® Visa Infinite* Card',
      url: 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/momentum-infinite-card.html',
    },
    {
      name: 'Scotiabank®* Gold American Express® Card',
      url: 'https://www.scotiabank.com/ca/en/personal/credit-cards/american-express/gold-card.html',
    },
    {
      name: 'Scotiabank Passport™ Visa Infinite Privilege* Card',
      url: 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/passport-infinite-privilege-card.html',
    },
  ]

  private known: Record<string, string> = {
    'Scotiabank Passport™ Visa Infinite* Card':           '35,000 Scene+ points after $2,000 spend in first 3 months',
    'Scotia Momentum® Visa Infinite* Card':               '10% cash back for first 3 months (up to $2,000 spend)',
    'Scotiabank®* Gold American Express® Card':           '30,000 Scene+ points after $2,000 spend in first 3 months',
    'Scotiabank Passport™ Visa Infinite Privilege* Card': '50,000 Scene+ points after $3,000 spend in first 3 months',
  }

  async scrape(): Promise<ScrapedOffer[]> {
    const offers: ScrapedOffer[] = []
    for (const card of this.cards) {
      try {
        const offer = await this.scrapeCard(card)
        if (offer) offers.push(offer)
        await new Promise(r => setTimeout(r, 1800))
      } catch (err) {
        console.error(`[scotiabank] ${card.name}:`, err)
      }
    }
    return offers
  }

  private async scrapeCard(card: { name: string; url: string }): Promise<ScrapedOffer | null> {
    let offerText = ''
    const extra_perks: string[] = []

    try {
      const res = await this.fetchWithTimeout(card.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
      })
      if (res.ok) {
        const $ = cheerio.load(await res.text())
        const body = $('body').text()
        offerText = findOfferText($)
        if (/no.?foreign.?transaction/i.test(body)) extra_perks.push('No foreign transaction fees')
        if (/annual.?fee.?waived/i.test(body))       extra_perks.push('First year annual fee waived')
      } else {
        console.warn(`[scotiabank] ${card.url} → HTTP ${res.status}, using known fallback`)
      }
    } catch (err) {
      console.warn(`[scotiabank] ${card.url} fetch failed, using known fallback`)
    }

    const usedFallback = !offerText
    const headline = (offerText || this.known[card.name] || '').replace(/\s+/g, ' ').trim().slice(0, 250)
    if (!headline) return null

    return {
      card_name: card.name,
      issuer_slug: this.issuerSlug,
      offer_type: 'welcome_bonus',
      headline,
      points_value: this.parsePoints(headline),
      spend_requirement: this.parseSpend(headline)?.amount,
      spend_timeframe_days: this.parseSpend(headline)?.days,
      extra_perks: extra_perks.length ? extra_perks : undefined,
      is_limited_time: false,
      source_url: card.url,
      apply_url: card.url,
      ...(usedFallback ? { sourcePriority: 3, isVerified: false } : {}),
    }
  }
}


// -----------------------------------------------
// BMO
// NOTE: BMO product page URLs currently all return
// 404 (BMO moved to a new URL structure). The
// scraper falls back entirely to the known map.
// -----------------------------------------------
export class BMOScraper extends BaseScraper {
  name = 'bmo-canada'
  issuerSlug = 'bmo'
  protected sourcePriority = 1
  protected isVerified = true

  private cards = [
    {
      name: 'BMO eclipse Visa Infinite* Card',
      url: 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-eclipse-visa-infinite-card/',
    },
    {
      name: 'BMO Ascend World Elite®* Mastercard®*',
      url: 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-ascend-world-elite-mastercard/',
    },
    {
      name: 'BMO AIR MILES®† World Elite®* Mastercard®*',
      url: 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-air-miles-world-elite-mastercard/',
    },
    {
      name: 'BMO CashBack® World Elite®* Mastercard®*',
      url: 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-cashback-world-elite-mastercard/',
    },
  ]

  private known: Record<string, string> = {
    'BMO eclipse Visa Infinite* Card':              '30,000 BMO Rewards points after $3,000 spend in 3 months (first year free)',
    'BMO Ascend World Elite®* Mastercard®*':        '55,000 BMO Rewards points after $4,500 spend in 3 months (first year free)',
    'BMO AIR MILES®† World Elite®* Mastercard®*':  '3,000 AIR MILES after $3,000 spend in 3 months (first year free)',
    'BMO CashBack® World Elite®* Mastercard®*':    '5% cash back for first 3 months (up to $2,500 spend)',
  }

  async scrape(): Promise<ScrapedOffer[]> {
    const offers: ScrapedOffer[] = []
    for (const card of this.cards) {
      try {
        const offer = await this.scrapeCard(card)
        if (offer) offers.push(offer)
        await new Promise(r => setTimeout(r, 2000))
      } catch (err) {
        console.error(`[bmo] ${card.name}:`, err)
      }
    }
    return offers
  }

  private async scrapeCard(card: { name: string; url: string }): Promise<ScrapedOffer | null> {
    let offerText = ''
    const extra_perks: string[] = []

    try {
      const res = await this.fetchWithTimeout(card.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
      })
      if (res.ok) {
        const $ = cheerio.load(await res.text())
        const body = $('body').text()
        offerText = findOfferText($)
        if (/annual.?fee.?waived|first.?year.?free/i.test(body)) extra_perks.push('First year annual fee waived')
      } else {
        console.warn(`[bmo] ${card.url} → HTTP ${res.status}, using known fallback`)
      }
    } catch (err) {
      console.warn(`[bmo] ${card.url} fetch failed, using known fallback`)
    }

    const usedFallback = !offerText
    const headline = (offerText || this.known[card.name] || '').replace(/\s+/g, ' ').trim().slice(0, 250)
    if (!headline) return null

    const is_limited_time = /limited time|expires/i.test(headline)

    return {
      card_name: card.name,
      issuer_slug: this.issuerSlug,
      offer_type: is_limited_time ? 'limited_time' : 'welcome_bonus',
      headline,
      points_value: this.parsePoints(headline),
      spend_requirement: this.parseSpend(headline)?.amount,
      spend_timeframe_days: this.parseSpend(headline)?.days,
      extra_perks: extra_perks.length ? extra_perks : undefined,
      is_limited_time,
      source_url: card.url,
      apply_url: card.url,
      ...(usedFallback ? { sourcePriority: 3, isVerified: false } : {}),
    }
  }
}


// -----------------------------------------------
// RBC
// -----------------------------------------------
export class RBCScraper extends BaseScraper {
  name = 'rbc-canada'
  issuerSlug = 'rbc'
  protected sourcePriority = 1
  protected isVerified = true

  private cards = [
    {
      name: 'RBC Avion Visa Infinite Card',
      url: 'https://www.rbcroyalbank.com/credit-cards/travel/rbc-visa-infinite-avion.html',
    },
    {
      name: 'WestJet RBC World Elite Mastercard',
      url: 'https://www.rbcroyalbank.com/credit-cards/travel/westjet-rbc-world-elite-mastercard.html',
    },
    {
      name: 'RBC Avion Visa Infinite Privilege',
      url: 'https://www.rbcroyalbank.com/credit-cards/travel/rbc-avion-visa-infinite-privilege.html',
    },
    {
      name: 'RBC ION+ Visa',
      // URL has not been confirmed working — known fallback will be used
      url: 'https://www.rbcroyalbank.com/credit-cards/everyday/rbc-ion-plus-visa.html',
    },
  ]

  private known: Record<string, string> = {
    'RBC Avion Visa Infinite Card':        '35,000 Avion points after first purchase',
    'WestJet RBC World Elite Mastercard':  '$450 WestJet dollars + first year annual fee waived',
    'RBC Avion Visa Infinite Privilege':   '55,000 Avion points after first purchase',
    'RBC ION+ Visa':                       '12,000 Avion points after first purchase',
  }

  async scrape(): Promise<ScrapedOffer[]> {
    const offers: ScrapedOffer[] = []
    for (const card of this.cards) {
      try {
        const offer = await this.scrapeCard(card)
        if (offer) offers.push(offer)
        await new Promise(r => setTimeout(r, 2000))
      } catch (err) {
        console.error(`[rbc] ${card.name}:`, err)
      }
    }
    return offers
  }

  private async scrapeCard(card: { name: string; url: string }): Promise<ScrapedOffer | null> {
    let offerText = ''

    try {
      const res = await this.fetchWithTimeout(card.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
      })
      if (res.ok) {
        offerText = findOfferText(cheerio.load(await res.text()))
      } else {
        console.warn(`[rbc] ${card.url} → HTTP ${res.status}, using known fallback`)
      }
    } catch (err) {
      console.warn(`[rbc] ${card.url} fetch failed, using known fallback`)
    }

    const usedFallback = !offerText
    const headline = (offerText || this.known[card.name] || '').replace(/\s+/g, ' ').trim().slice(0, 250)
    if (!headline) return null

    const is_limited_time = /limited time|expires/i.test(headline)

    return {
      card_name: card.name,
      issuer_slug: this.issuerSlug,
      offer_type: is_limited_time ? 'limited_time' : 'welcome_bonus',
      headline,
      points_value: this.parsePoints(headline),
      spend_requirement: this.parseSpend(headline)?.amount,
      spend_timeframe_days: this.parseSpend(headline)?.days,
      is_limited_time,
      source_url: card.url,
      apply_url: card.url,
      ...(usedFallback ? { sourcePriority: 3, isVerified: false } : {}),
    }
  }
}


// -----------------------------------------------
// CIBC
// -----------------------------------------------
export class CIBCScraper extends BaseScraper {
  name = 'cibc-canada'
  issuerSlug = 'cibc'
  protected sourcePriority = 1
  protected isVerified = true

  private cards = [
    {
      name: 'CIBC Aventura® Visa Infinite* Card',
      url: 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aventura-visa-infinite-card.html',
    },
    {
      name: 'CIBC Aeroplan® Visa Infinite* Card',
      url: 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aeroplan-visa-infinite-card.html',
    },
    {
      name: 'CIBC Dividend® Visa Infinite* Card',
      url: 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/dividend-visa-infinite-card.html',
    },
  ]

  private known: Record<string, string> = {
    'CIBC Aventura® Visa Infinite* Card':  '35,000 Aventura Points after $3,000 spend in 4 months',
    'CIBC Aeroplan® Visa Infinite* Card':  '10,000 Aeroplan points after first purchase + first year free',
    'CIBC Dividend® Visa Infinite* Card':  '10% cash back for first 4 statements (up to $3,000 spend)',
  }

  async scrape(): Promise<ScrapedOffer[]> {
    const offers: ScrapedOffer[] = []
    for (const card of this.cards) {
      try {
        const offer = await this.scrapeCard(card)
        if (offer) offers.push(offer)
        await new Promise(r => setTimeout(r, 2000))
      } catch (err) {
        console.error(`[cibc] ${card.name}:`, err)
      }
    }
    return offers
  }

  private async scrapeCard(card: { name: string; url: string }): Promise<ScrapedOffer | null> {
    let offerText = ''
    const extra_perks: string[] = []

    try {
      const res = await this.fetchWithTimeout(card.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
      })
      if (res.ok) {
        const $ = cheerio.load(await res.text())
        const body = $('body').text()
        offerText = findOfferText($)
        if (/annual.?fee.?waived|first.?year.?free/i.test(body)) extra_perks.push('First year annual fee waived')
      } else {
        console.warn(`[cibc] ${card.url} → HTTP ${res.status}, using known fallback`)
      }
    } catch (err) {
      console.warn(`[cibc] ${card.url} fetch failed, using known fallback`)
    }

    const usedFallback = !offerText
    const headline = (offerText || this.known[card.name] || '').replace(/\s+/g, ' ').trim().slice(0, 250)
    if (!headline) return null

    const is_limited_time = /limited|expires/i.test(headline)

    return {
      card_name: card.name,
      issuer_slug: this.issuerSlug,
      offer_type: is_limited_time ? 'limited_time' : 'welcome_bonus',
      headline,
      points_value: this.parsePoints(headline),
      spend_requirement: this.parseSpend(headline)?.amount,
      spend_timeframe_days: this.parseSpend(headline)?.days,
      extra_perks: extra_perks.length ? extra_perks : undefined,
      is_limited_time,
      source_url: card.url,
      apply_url: card.url,
      ...(usedFallback ? { sourcePriority: 3, isVerified: false } : {}),
    }
  }
}

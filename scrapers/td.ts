// scrapers/td.ts
// Scrapes TD Canada credit card offers

import * as cheerio from 'cheerio'
import { BaseScraper } from '../lib/scraper-base'
import type { ScrapedOffer } from '../types'

export class TDScraper extends BaseScraper {
  name = 'td-canada'
  issuerSlug = 'td'
  protected sourcePriority = 1
  protected isVerified = true

  private readonly BASE_URL = 'https://www.td.com'
  private readonly CARDS_URL = 'https://www.td.com/ca/en/personal-banking/products/credit-cards'

  private cards = [
    {
      name: 'TD Aeroplan Visa Infinite Card',
      url: 'https://www.td.com/ca/en/personal-banking/products/credit-cards/travel/aeroplan-visa-infinite-card/',
    },
    {
      name: 'TD Aeroplan Visa Infinite Privilege Card',
      url: 'https://www.td.com/ca/en/personal-banking/products/credit-cards/travel/aeroplan-visa-infinite-privilege-card/',
    },
    {
      name: 'TD First Class Travel Visa Infinite Card',
      url: 'https://www.td.com/ca/en/personal-banking/products/credit-cards/travel/first-class-travel-visa-infinite-card/',
    },
    {
      name: 'TD Cash Back Visa Infinite Card',
      url: 'https://www.td.com/ca/en/personal-banking/products/credit-cards/cash-back/cash-back-visa-infinite-card/',
    },
    {
      name: 'TD Rewards Visa Card',
      url: 'https://www.td.com/ca/en/personal-banking/products/credit-cards/no-fee/td-rewards-visa-card/',
    },
  ]

  async scrape(): Promise<ScrapedOffer[]> {
    const offers: ScrapedOffer[] = []

    for (const card of this.cards) {
      try {
        const offer = await this.scrapeCard(card)
        if (offer) offers.push(offer)
        await this.delay(2000)
      } catch (err) {
        console.error(`[td] Failed to scrape ${card.name}:`, err)
      }
    }

    return offers
  }

  private async scrapeCard(card: { name: string; url: string }): Promise<ScrapedOffer | null> {
    const response = await this.fetchWithTimeout(card.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
    })

    if (!response.ok) return null

    const html = await response.text()
    const $ = cheerio.load(html)

    // TD puts welcome bonus in hero banner or offer section
    const selectors = [
      '.td-offer-banner',
      '[class*="offer-highlight"]',
      '[class*="welcomeBonus"]',
      '.hero-offer',
      'section:contains("Welcome Offer")',
    ]

    let offerText = ''
    for (const sel of selectors) {
      const text = $(sel).first().text().trim()
      if (text && text.length > 10) {
        offerText = text
        break
      }
    }

    // TD pages also have offer details in lists
    if (!offerText) {
      $('ul li, p').each((_, el) => {
        const text = $(el).text()
        if (
          (text.includes('Aeroplan') || text.includes('points') || text.includes('miles')) &&
          text.includes('$') &&
          text.length < 300
        ) {
          offerText = text.trim()
          return false // break
        }
      })
    }

    // Check for limited time / expiry
    const expiryText = $('p:contains("Offer expires"), p:contains("until"), [class*="expiry"]').text()
    const is_limited_time = /limited time|expires|until \w+ \d{4}/i.test(expiryText + offerText)
    const expires_at = this.parseExpiry(expiryText)

    // Check for annual fee waiver
    const extra_perks: string[] = []
    const pageText = $('body').text()
    if (/first.?year.?annual.?fee.?(waived|rebated|free)/i.test(pageText)) {
      extra_perks.push('First year annual fee rebated')
    }

    let usedFallback = false
    if (!offerText) {
      offerText = this.getKnownOffer(card.name)
      if (!offerText) return null
      usedFallback = true
    }

    const headline = offerText.replace(/\s+/g, ' ').trim().slice(0, 250)
    const points_value = this.parsePoints(offerText)
    const spend = this.parseSpend(offerText)

    return {
      card_name: card.name,
      issuer_slug: this.issuerSlug,
      offer_type: is_limited_time ? 'limited_time' : 'welcome_bonus',
      headline,
      points_value,
      spend_requirement: spend?.amount,
      spend_timeframe_days: spend?.days,
      extra_perks: extra_perks.length ? extra_perks : undefined,
      is_limited_time,
      expires_at,
      source_url: card.url,
      apply_url: card.url,
      // Hardcoded fallback data is less trustworthy than a live scrape
      ...(usedFallback ? { sourcePriority: 3, isVerified: false } : {}),
    }
  }

  private getKnownOffer(cardName: string): string {
    const known: Record<string, string> = {
      'TD Aeroplan Visa Infinite Card': '20,000 Aeroplan points + first year annual fee rebated',
      'TD Aeroplan Visa Infinite Privilege Card': '40,000 Aeroplan points after $10,000 spend in 6 months',
      'TD First Class Travel Visa Infinite Card': '80,000 TD Rewards points after $5,000 spend in 180 days',
      'TD Cash Back Visa Infinite Card': '6% cash back on all purchases for the first 3 months',
    }
    return known[cardName] ?? ''
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }
}

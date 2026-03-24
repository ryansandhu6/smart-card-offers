// scrapers/amex.ts
// Scrapes American Express Canada credit card offers
// Uses Cheerio for HTML parsing + fetch (no Playwright needed for Amex)

import * as cheerio from 'cheerio'
import { BaseScraper } from '../lib/scraper-base'
import type { ScrapedOffer } from '../types'

export class AmexScraper extends BaseScraper {
  name = 'amex-canada'
  issuerSlug = 'amex'
  protected sourcePriority = 1
  protected isVerified = true

  // Known Amex Canada cards with their offer pages
  private cards = [
    {
      name: 'American Express Cobalt Card',
      url: 'https://www.americanexpress.com/en-ca/credit-cards/cobalt-card/',
    },
    {
      name: 'The Platinum Card® from American Express',
      url: 'https://www.americanexpress.com/en-ca/charge-cards/the-platinum-card/',
    },
    {
      name: 'American Express® Gold Rewards Card',
      url: 'https://www.americanexpress.com/en-ca/credit-cards/gold-rewards-card/',
    },
    {
      name: 'American Express® Business Gold Rewards Card',
      url: 'https://www.americanexpress.com/en-ca/business/credit-cards/business-gold-rewards-card/',
    },
    {
      name: 'American Express® Aeroplan®* Reserve Card',
      url: 'https://www.americanexpress.com/en-ca/credit-cards/aeroplan-reserve-card/',
    },
    {
      name: 'SimplyCash™ Preferred Card from American Express',
      url: 'https://www.americanexpress.com/en-ca/credit-cards/simply-cash-preferred/',
    },
  ]

  async scrape(): Promise<ScrapedOffer[]> {
    const offers: ScrapedOffer[] = []

    for (const card of this.cards) {
      try {
        const offer = await this.scrapeCard(card)
        if (offer) offers.push(offer)
        // Polite delay between requests
        await this.delay(1500)
      } catch (err) {
        console.error(`[amex] Failed to scrape ${card.name}:`, err)
      }
    }

    return offers
  }

  private async scrapeCard(card: { name: string; url: string }): Promise<ScrapedOffer | null> {
    const response = await this.fetchWithTimeout(card.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-CA,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      console.warn(`[amex] HTTP ${response.status} for ${card.url}`)
      return null
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Amex typically puts welcome offer in hero section or offer banner
    // These selectors may need updating if Amex changes their layout
    const offerText =
      $('[class*="welcome-offer"]').text() ||
      $('[class*="WelcomeOffer"]').text() ||
      $('[data-module="welcomeOffer"]').text() ||
      $('h2:contains("Welcome Offer")').next().text() ||
      $('h2:contains("welcome bonus")').next().text() ||
      ''

    // Also try to find expiry
    const expiryText = 
      $('[class*="offer-expiry"]').text() ||
      $('p:contains("Offer expires")').text() ||
      $('p:contains("Limited time")').text() ||
      ''

    // Fall back: look for any text with point amounts in it
    let headline = ''
    let points_value: number | undefined
    let spend_requirement: number | undefined
    let spend_timeframe_days: number | undefined
    let is_limited_time = false
    let usedFallback = false

    if (offerText) {
      headline = offerText.replace(/\s+/g, ' ').trim().slice(0, 200)
      const parsed = this.parsePoints(offerText)
      if (parsed) points_value = parsed

      const spend = this.parseSpend(offerText)
      if (spend) {
        spend_requirement = spend.amount
        spend_timeframe_days = spend.days
      }
    }

    if (expiryText.toLowerCase().includes('expires') || expiryText.toLowerCase().includes('limited')) {
      is_limited_time = true
    }

    // If we couldn't extract an offer from the page, use known static data
    // (update these manually when you verify the offers)
    if (!headline) {
      headline = this.getKnownOffer(card.name)
      if (!headline) return null
      usedFallback = true
    }

    const expires_at = expiryText ? this.parseExpiry(expiryText) : undefined

    return {
      card_name: card.name,
      issuer_slug: this.issuerSlug,
      offer_type: is_limited_time ? 'limited_time' : 'welcome_bonus',
      headline,
      points_value,
      spend_requirement,
      spend_timeframe_days,
      is_limited_time,
      expires_at,
      source_url: card.url,
      apply_url: card.url,
      // Hardcoded fallback data is less trustworthy than a live scrape
      ...(usedFallback ? { sourcePriority: 3, isVerified: false } : {}),
    }
  }

  // Fallback known offers — update these manually when you verify
  private getKnownOffer(cardName: string): string {
    const known: Record<string, string> = {
      'American Express Cobalt Card':                  '22,000 Amex MR points after $750 spend per month for 12 months',
      'The Platinum Card® from American Express':      '70,000 Amex MR points after $10,000 spend in 3 months',
      'American Express® Gold Rewards Card':           'Up to 60,000 Amex MR points after $12,000 spend in 12 months',
      'American Express® Business Gold Rewards Card':  '40,000 Amex MR points after $7,500 spend in 3 months',
      'American Express® Aeroplan®* Reserve Card':     '90,000 Aeroplan points after $7,500 spend in 3 months',
      'SimplyCash™ Preferred Card from American Express': '10% cash back in your first 4 months (up to $400)',
    }
    return known[cardName] ?? ''
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }
}

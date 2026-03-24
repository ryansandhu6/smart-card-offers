// scrapers/mortgage-rates.ts
// Scrapes Canadian mortgage rates from public sources
// Primary: ratehub.ca (aggregator, most reliable)
// Secondary: Individual lender pages

import * as cheerio from 'cheerio'
import { BaseMortgageScraper } from '../lib/scraper-base'
import type { ScrapedMortgageRate } from '../types'

export class RatehubScraper extends BaseMortgageScraper {
  name = 'ratehub-mortgage'

  async scrape(): Promise<ScrapedMortgageRate[]> {
    const rates: ScrapedMortgageRate[] = []

    try {
      const fixedRates = await this.scrapeRatehubFixed()
      rates.push(...fixedRates)
    } catch (err) {
      console.error('[ratehub] fixed rates failed:', err)
    }

    try {
      const variableRates = await this.scrapeRatehubVariable()
      rates.push(...variableRates)
    } catch (err) {
      console.error('[ratehub] variable rates failed:', err)
    }

    return rates
  }

  private async scrapeRatehubFixed(): Promise<ScrapedMortgageRate[]> {
    const url = 'https://www.ratehub.ca/best-mortgage-rates'
    const res = await this.fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const html = await res.text()
    const $ = cheerio.load(html)
    const rates: ScrapedMortgageRate[] = []

    // Strategy 1: any table row with a % between 3–8 and a nearby lender name
    $('table tr, [class*="rate"] tr, [class*="Rate"] tr').each((_, row) => {
      const cells = $(row).find('td, th')
      if (cells.length < 2) return
      const texts = cells.toArray().map(c => $(c).text().trim())

      // Find cell containing a plausible mortgage rate
      const rateIdx = texts.findIndex(t => /^[3-8]\.\d{1,3}\s*%?$/.test(t.replace(/\s/g, '')))
      if (rateIdx === -1) return

      const rate = parseFloat(texts[rateIdx].replace('%', ''))
      const lender = texts.find((t, i) => i !== rateIdx && t.length > 2 && t.length < 60) ?? ''
      if (!lender) return

      const termText = texts.find(t => /\d+\s*(?:yr|year)/i.test(t)) ?? ''
      const term = this.parseTerm(termText) ?? 5

      rates.push({
        lender,
        lender_slug: lender.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        rate_type: 'fixed',
        term_years: term,
        rate,
        source_url: url,
      })
    })

    // Strategy 2: scan all text nodes for "X.XX% … lender" or "lender … X.XX%" patterns
    if (rates.length === 0) {
      const RATE_RE = /\b([3-8]\.\d{1,3})\s*%/g
      $('p, li, div, span').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim()
        if (text.length > 200 || text.length < 5) return
        let m: RegExpExecArray | null
        while ((m = RATE_RE.exec(text)) !== null) {
          const rate = parseFloat(m[1])
          // Look for a lender name nearby (non-numeric word cluster)
          const lenderMatch = text.replace(m[0], '').match(/[A-Z][a-zA-Z\s]{2,30}(?:Bank|Trust|Financial|Mortgage|Credit)?/)
          if (!lenderMatch) continue
          const lender = lenderMatch[0].trim()
          rates.push({
            lender,
            lender_slug: lender.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            rate_type: 'fixed',
            term_years: 5,
            rate,
            source_url: url,
          })
        }
      })
    }

    // Strategy 3: embedded JSON
    if (rates.length === 0) {
      const jsonMatch = html.match(/"rates"\s*:\s*(\[[\s\S]*?\])/)?.[1]
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch)
          for (const r of parsed) {
            if (r.rate && r.lender) {
              const rate = parseFloat(r.rate)
              if (rate < 3 || rate > 8) continue
              rates.push({
                lender: r.lender,
                lender_slug: r.lender.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                rate_type: 'fixed',
                term_years: this.parseTerm(String(r.term ?? '')) ?? 5,
                rate,
                source_url: url,
              })
            }
          }
        } catch {}
      }
    }

    return rates
  }

  private async scrapeRatehubVariable(): Promise<ScrapedMortgageRate[]> {
    const url = 'https://www.ratehub.ca/variable-mortgage-rates'
    const res = await this.fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
    })

    if (!res.ok) return []

    const html = await res.text()
    const $ = cheerio.load(html)
    const rates: ScrapedMortgageRate[] = []

    // Same aggressive approach — any table row with a plausible rate
    $('table tr, [class*="rate"] tr, [class*="Rate"] tr').each((_, row) => {
      const cells = $(row).find('td, th')
      if (cells.length < 2) return
      const texts = cells.toArray().map(c => $(c).text().trim())

      const rateIdx = texts.findIndex(t => /^[3-8]\.\d{1,3}\s*%?$/.test(t.replace(/\s/g, '')))
      if (rateIdx === -1) return

      const rate = parseFloat(texts[rateIdx].replace('%', ''))
      const lender = texts.find((t, i) => i !== rateIdx && t.length > 2 && t.length < 60) ?? ''
      if (!lender) return

      rates.push({
        lender,
        lender_slug: lender.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        rate_type: 'variable',
        term_years: 5,
        rate,
        source_url: url,
      })
    })

    return rates
  }

  private parseTerm(text: string): number | undefined {
    const match = text.match(/(\d+)\s*(?:yr|year)/i)
    return match ? parseInt(match[1]) : undefined
  }
}


// -----------------------------------------------
// Scrape individual big bank posted rates
// -----------------------------------------------
export class BigBankMortgageScraper extends BaseMortgageScraper {
  name = 'big-bank-mortgage'

  // Big 5 posted rate pages
  private sources = [
    {
      lender: 'TD',
      slug: 'td',
      url: 'https://www.td.com/ca/en/personal-banking/products/mortgages/mortgage-rates/',
    },
    {
      lender: 'RBC',
      slug: 'rbc',
      url: 'https://www.rbcroyalbank.com/mortgages/mortgage-rates.html',
    },
    {
      lender: 'Scotiabank',
      slug: 'scotiabank',
      url: 'https://www.scotiabank.com/ca/en/personal/rates/mortgage-rates.html',
    },
    {
      lender: 'BMO',
      slug: 'bmo',
      url: 'https://www.bmo.com/en-ca/main/personal/mortgages/mortgage-rates/',
    },
    {
      lender: 'CIBC',
      slug: 'cibc',
      url: 'https://www.cibc.com/en/personal-banking/mortgages/rates.html',
    },
  ]

  async scrape(): Promise<ScrapedMortgageRate[]> {
    const rates: ScrapedMortgageRate[] = []

    for (const source of this.sources) {
      try {
        const lenderRates = await this.scrapeLender(source)
        rates.push(...lenderRates)
        await new Promise(r => setTimeout(r, 2000))
      } catch (err) {
        console.error(`[big-bank-mortgage] ${source.lender}:`, err)
      }
    }

    return rates
  }

  private async scrapeLender(source: {
    lender: string
    slug: string
    url: string
  }): Promise<ScrapedMortgageRate[]> {
    const res = await this.fetchWithTimeout(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'en-CA' },
    })
    if (!res.ok) return []

    const $ = cheerio.load(await res.text())
    const rates: ScrapedMortgageRate[] = []

    // Most bank rate pages use a table layout
    $('table tr').each((_, row) => {
      const cells = $(row).find('td, th')
      if (cells.length < 2) return

      const termText = $(cells[0]).text().trim()
      const rateText = $(cells[1]).text().trim() || $(cells[2]).text().trim()

      const term = this.parseTerm(termText)
      const rate = parseFloat(rateText.replace(/[^0-9.]/g, ''))

      if (!term || isNaN(rate) || rate < 1 || rate > 15) return

      const rateType = /variable|prime/i.test(termText) ? 'variable' : 'fixed'

      rates.push({
        lender: source.lender,
        lender_slug: source.slug,
        rate_type: rateType,
        term_years: term,
        rate,
        posted_rate: rate, // Big bank rates are posted rates
        source_url: source.url,
        notes: 'Posted rate — actual rate may be lower',
      })
    })

    return rates
  }

  private parseTerm(text: string): number | undefined {
    const match = text.match(/(\d+)\s*(?:yr|year|-year)/i)
    return match ? parseInt(match[1]) : undefined
  }
}

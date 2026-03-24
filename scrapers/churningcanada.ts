// scrapers/churningcanada.ts
// Scrapes the r/churningcanada community-maintained GitHub repo for Canadian CC offers.
// Source: https://github.com/stnlykwk/canada-best-cc-offers
//
// SHA-gating: only re-scrapes when the README's latest commit SHA differs from the one
// stored in scrape_logs after the last successful run. The SHA is stored in a separate
// scrape_logs entry with scraper_name = 'churningcanada-sha' to keep the actual scrape
// logs clean.

import { BaseScraper } from '../lib/scraper-base'
import { supabaseAdmin, logScrape } from '../lib/supabase'
import type { ScrapedOffer, ScrapeResult } from '../types'

const README_URL   = 'https://raw.githubusercontent.com/stnlykwk/canada-best-cc-offers/main/README.md'
const COMMITS_API  = 'https://api.github.com/repos/stnlykwk/canada-best-cc-offers/commits?path=README.md&per_page=1'
const SOURCE_URL   = 'https://github.com/stnlykwk/canada-best-cc-offers'
const SCRAPER_NAME = 'churningcanada'
const SHA_LOG_NAME = 'churningcanada-sha'

// ── Issuer resolution ────────────────────────────────────────────────────────
// Order matters: "Scotia Amex Gold" must match scotiabank before amex.
const ISSUER_MAP: [RegExp, string][] = [
  [/\bscotia/i,                              'scotiabank'],
  [/\btd\b/i,                                'td'],
  [/\bcibc\b/i,                              'cibc'],
  [/\bmbna\b/i,                              'mbna'],
  [/\brbc\b|westjet|british\s+airways/i,     'rbc'],
  [/\bbmo\b/i,                               'bmo'],
  [/\bamex\b|american\s+express/i,           'amex'],
  [/\bnational\s+bank/i,                     'national-bank'],
  [/\bdesjardins/i,                          'desjardins'],
  [/\btangerine/i,                           'tangerine'],
]

function resolveIssuer(cardName: string): string {
  for (const [re, slug] of ISSUER_MAP) {
    if (re.test(cardName)) return slug
  }
  return 'unknown'
}

// ── Markdown table parser ────────────────────────────────────────────────────

/** Strip markdown link syntax: [Card Name](#anchor) → Card Name */
function stripLink(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
}

/**
 * Parse the earliest apply-by date from a cell like:
 * "FF: Jun 1, 2026 <br/> CCG: Jun 1, 2026 <br/> GCR: Jun 1, 2026"
 * Returns ISO date string "YYYY-MM-DD" or undefined if no date found.
 */
function parseApplyBy(cell: string): string | undefined {
  const text = cell.replace(/<br\s*\/?>/gi, ' ')
  const DATE_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}/gi
  const dates: Date[] = []
  for (const m of text.matchAll(DATE_RE)) {
    const d = new Date(m[0].replace(/\./g, ''))
    if (!isNaN(d.getTime())) dates.push(d)
  }
  if (!dates.length) return undefined
  dates.sort((a, b) => a.getTime() - b.getTime())
  return dates[0].toISOString().split('T')[0]
}

/**
 * Parse the primary dollar amount from the Spend Requirement column.
 * "$15,000" → 15000 | "$5,000 - $18,000" → 5000 | "$750 / month" → 750
 */
function parseSpendAmount(cell: string): number | undefined {
  const match = cell.match(/\$?([\d,]+)/)
  if (!match) return undefined
  const n = parseInt(match[1].replace(/,/g, ''))
  return isNaN(n) ? undefined : n
}

/** True if the bonus is percentage-based ("10%") or a plain dollar amount ("$200"). */
function isCashbackBonus(bonus: string): boolean {
  return /\d+\s*%/.test(bonus) || /^\$[\d,]+$/.test(bonus.trim())
}

/** Parse points from bonus string; returns undefined for cashback offers. */
function parsePoints(bonus: string): number | undefined {
  if (isCashbackBonus(bonus)) return undefined
  const match = bonus.match(/([\d,]+)/)
  if (!match) return undefined
  const n = parseInt(match[1].replace(/,/g, ''))
  // Require > 100 to avoid matching "2x" earn rates or "$200" dollar values
  return n > 100 ? n : undefined
}

/** Parse cashback percentage from "10% up to $3,000" → 10 */
function parseCashbackPct(bonus: string): number | undefined {
  const match = bonus.match(/([\d.]+)\s*%/)
  if (!match) return undefined
  return parseFloat(match[1])
}

interface TableRow {
  cardName: string
  annualFee: string
  welcomeBonus: string
  spendRequirement: string
  applyBy: string
}

/**
 * Parse all markdown table rows from the README.
 * Handles both the "Top Tier" and "Cards Worth Considering" tables.
 */
function parseMarkdownTables(markdown: string): TableRow[] {
  const rows: TableRow[] = []
  const lines = markdown.split('\n')
  let inTable = false
  let pastSeparator = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed.startsWith('|')) {
      // Leaving a table
      inTable = false
      pastSeparator = false
      continue
    }

    // Split on | and strip leading/trailing empty cells
    const cells = trimmed
      .split('|')
      .map(c => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)

    if (!cells.length) continue

    // Detect header row by presence of "Card Name" or "Annual Fee"
    if (!inTable && cells.some(c => /card\s+name|annual\s+fee/i.test(c))) {
      inTable = true
      pastSeparator = false
      continue
    }

    if (inTable && !pastSeparator) {
      // Separator row: | --- | --- | ...
      if (cells.every(c => /^[-:|]+$/.test(c))) {
        pastSeparator = true
        continue
      }
    }

    if (!inTable || !pastSeparator) continue
    if (cells.length < 4) continue

    // Normalise HTML entities inside cells (br tags, etc.)
    const clean = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim()

    rows.push({
      cardName:         stripLink(cells[0]),
      annualFee:        clean(cells[1]),
      welcomeBonus:     clean(cells[2]),
      spendRequirement: clean(cells[3]),
      applyBy:          cells[4] ? cells[4] : '',
    })
  }

  return rows
}

// ── Main scraper class ───────────────────────────────────────────────────────

export class ChurningCanadaScraper extends BaseScraper {
  name       = SCRAPER_NAME
  issuerSlug = 'amex'  // unused — each offer has its own issuer_slug

  // Community-maintained repo: treat as bank-direct quality (priority 1, verified)
  protected sourcePriority = 1
  protected isVerified     = true

  // ── GitHub SHA helpers ──────────────────────────────────────────────────

  private async fetchLatestSha(): Promise<string | null> {
    try {
      const res = await fetch(COMMITS_API, {
        headers: {
          'User-Agent': 'smart-card-offers-scraper',
          'Accept':     'application/vnd.github+json',
        },
      })
      if (!res.ok) {
        console.warn(`[${SCRAPER_NAME}] commits API → HTTP ${res.status}`)
        return null
      }
      const data = await res.json()
      return (data as Array<{ sha: string }>)?.[0]?.sha ?? null
    } catch (err) {
      console.warn(`[${SCRAPER_NAME}] failed to fetch latest SHA:`, err)
      return null
    }
  }

  private async getLastScrapedSha(): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('scrape_logs')
      .select('error_message')
      .eq('scraper_name', SHA_LOG_NAME)
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const msg = (data as { error_message?: string } | null)?.error_message ?? ''
    return msg.startsWith('sha:') ? msg.slice(4) : null
  }

  private async storeScrapedSha(sha: string): Promise<void> {
    await supabaseAdmin.from('scrape_logs').insert({
      scraper_name:    SHA_LOG_NAME,
      status:          'success',
      records_found:   0,
      records_updated: 0,
      error_message:   `sha:${sha}`,
      duration_ms:     0,
    })
  }

  // ── Override run() to add SHA-gating ───────────────────────────────────

  async run(): Promise<ScrapeResult> {
    const startTime = Date.now()
    console.log(`[${SCRAPER_NAME}] Checking GitHub README commit SHA...`)

    const [latestSha, lastSha] = await Promise.all([
      this.fetchLatestSha(),
      this.getLastScrapedSha(),
    ])

    if (latestSha && latestSha === lastSha) {
      const duration_ms = Date.now() - startTime
      console.log(`[${SCRAPER_NAME}] README unchanged (sha: ${latestSha.slice(0, 7)}), skipping scrape`)
      await logScrape({
        scraper_name:    SCRAPER_NAME,
        status:          'success',
        records_found:   0,
        records_updated: 0,
        duration_ms,
      })
      return { scraper: SCRAPER_NAME, status: 'success', records_found: 0, records_updated: 0, duration_ms }
    }

    if (latestSha) {
      console.log(
        `[${SCRAPER_NAME}] README changed (${lastSha?.slice(0, 7) ?? 'no prior'} → ${latestSha.slice(0, 7)}), scraping...`
      )
    } else {
      console.log(`[${SCRAPER_NAME}] Could not determine SHA — scraping unconditionally`)
    }

    // Delegate to BaseScraper.run() which calls this.scrape(), saves offers, and logs
    const result = await super.run()

    // Persist the new SHA so future runs can skip unchanged content
    if (latestSha && result.status !== 'failed') {
      await this.storeScrapedSha(latestSha)
    }

    return result
  }

  // ── Core scrape logic ───────────────────────────────────────────────────

  async scrape(): Promise<ScrapedOffer[]> {
    const res = await fetch(README_URL, {
      headers: {
        'User-Agent':    'smart-card-offers-scraper',
        'Cache-Control': 'no-cache',
      },
    })
    if (!res.ok) throw new Error(`Failed to fetch README: HTTP ${res.status}`)
    const markdown = await res.text()

    const rows = parseMarkdownTables(markdown)
    console.log(`[${SCRAPER_NAME}] parsed ${rows.length} table rows from README`)

    const offers: ScrapedOffer[] = []

    for (const row of rows) {
      const issuer_slug = resolveIssuer(row.cardName)
      if (issuer_slug === 'unknown') {
        console.warn(`[${SCRAPER_NAME}] could not resolve issuer for: "${row.cardName}"`)
        continue
      }

      // Skip rows that have no meaningful bonus info (e.g. placeholder or header rows)
      const bonus = row.welcomeBonus
      if (!bonus || bonus === '-' || bonus.length < 2) continue

      const spendAmount  = parseSpendAmount(row.spendRequirement)
      const expires_at   = parseApplyBy(row.applyBy)
      const fyf          = /fyf|first\s+year\s+free/i.test(row.annualFee)
      const isCashback   = isCashbackBonus(bonus)

      // Build a human-readable headline
      const parts: string[] = [bonus]
      if (spendAmount) parts.push(`after $${spendAmount.toLocaleString()} spend`)
      if (fyf)         parts.push('(first year free)')
      const headline = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 250)

      const extra_perks: string[] = []
      if (fyf) extra_perks.push('First year annual fee waived')
      if (/no.?fx|no.?foreign/i.test(bonus)) extra_perks.push('No foreign transaction fees')

      offers.push({
        card_name:            row.cardName,
        issuer_slug,
        offer_type:           expires_at ? 'limited_time' : 'welcome_bonus',
        headline,
        points_value:         isCashback ? undefined : parsePoints(bonus),
        cashback_value:       isCashback ? parseCashbackPct(bonus) : undefined,
        spend_requirement:    spendAmount,
        is_limited_time:      !!expires_at,
        expires_at,
        extra_perks:          extra_perks.length ? extra_perks : undefined,
        source_url:           SOURCE_URL,
        apply_url:            undefined,
      })
    }

    return offers
  }
}

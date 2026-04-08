/**
 * Debug script: fetch one PoT card page and log exactly what the scraper extracts
 * for card-level fields (FX fee, min income, household income).
 *
 * Usage: npx tsx scripts/debug-pot-extraction.ts [url]
 * Default URL: https://princeoftravel.com/credit-cards/scotiabank-passport-visa-infinite/
 */

import * as cheerio from 'cheerio'

const DEFAULT_URL = 'https://princeoftravel.com/credit-cards/scotiabank-passport-visa-infinite/'
const url = process.argv[2] ?? DEFAULT_URL

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-CA,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function main() {
  console.log(`\nFetching: ${url}\n`)
  const html = await fetchPage(url)
  const $ = cheerio.load(html)

  // ── 1. Show all table rows so we can see actual labels ──────────────────────
  console.log('=== ALL TABLE ROWS (label → value) ===')
  $('table tr').each((i, tr) => {
    const cells = $(tr).find('td, th').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
    if (cells.length >= 2) {
      console.log(`  [${i}] "${cells[0]}" → "${cells[1]}"`)
    }
  })

  // ── 2. Run the exact extraction logic from scrapeCardPage ──────────────────
  let card_min_income: number | undefined
  let card_min_household_income: number | undefined
  let card_foreign_transaction_fee: number | null | undefined

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td, th').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
    if (cells.length < 2) return
    const label = cells[0].toLowerCase()
    const value = cells[1]

    if (/minimum\s+(?:personal\s+)?income|personal\s+income/i.test(label) && card_min_income == null) {
      const m = value.match(/\$?([\d,]+)/)
      if (m) card_min_income = parseInt(m[1].replace(/,/g, ''))
      console.log(`\n[MATCH] personal income label: "${cells[0]}" → "${value}" → parsed: ${card_min_income}`)
    }

    if (/household\s+income/i.test(label) && card_min_household_income == null) {
      const m = value.match(/\$?([\d,]+)/)
      if (m) card_min_household_income = parseInt(m[1].replace(/,/g, ''))
      console.log(`[MATCH] household income label: "${cells[0]}" → "${value}" → parsed: ${card_min_household_income}`)
    }

    if (/foreign\s+(?:transaction\s+)?fee|fx\s+fee/i.test(label) && card_foreign_transaction_fee == null) {
      if (/no\s*fee|free|\$?0\b|0%/i.test(value) || /none/i.test(value)) {
        card_foreign_transaction_fee = 0
      } else {
        const m = value.match(/([\d.]+)\s*%/)
        if (m) card_foreign_transaction_fee = parseFloat(m[1])
      }
      console.log(`[MATCH] FX fee label: "${cells[0]}" → "${value}" → parsed: ${card_foreign_transaction_fee}`)
    }
  })

  // ── 3. Body text fallbacks ──────────────────────────────────────────────────
  const bodyText = $('body').text().replace(/\s+/g, ' ')

  if (card_min_income == null) {
    const m = bodyText.match(/minimum\s+(?:personal\s+)?income[:\s]+\$?([\d,]+)/i)
    if (m) {
      card_min_income = parseInt(m[1].replace(/,/g, ''))
      console.log(`\n[BODY FALLBACK] personal income: "${m[0]}" → ${card_min_income}`)
    }
  }

  if (card_min_household_income == null) {
    const m = bodyText.match(/minimum\s+household\s+income[:\s]+\$?([\d,]+)|household[:\s]+\$?([\d,]+)/i)
    if (m) {
      card_min_household_income = parseInt((m[1] ?? m[2]).replace(/,/g, ''))
      console.log(`[BODY FALLBACK] household income: "${m[0]}" → ${card_min_household_income}`)
    }
  }

  if (card_foreign_transaction_fee == null &&
      /no\s+(?:foreign\s+)?(?:transaction\s+)?fee|no\s+fx\s+fee|\bno\s+fx\b/i.test(bodyText)) {
    card_foreign_transaction_fee = 0
    console.log(`[BODY FALLBACK] FX fee: detected "no fee" in body text`)
  }

  // ── 4. Summary ──────────────────────────────────────────────────────────────
  console.log('\n=== EXTRACTION RESULTS ===')
  console.log(`  card_foreign_transaction_fee : ${card_foreign_transaction_fee ?? 'undefined (not extracted)'}`)
  console.log(`  card_min_income              : ${card_min_income ?? 'undefined (not extracted)'}`)
  console.log(`  card_min_household_income    : ${card_min_household_income ?? 'undefined (not extracted)'}`)

  // ── 5. Scan body text for any income/FX-related sentences ──────────────────
  console.log('\n=== BODY TEXT — income/FX sentences ===')
  const sentences = bodyText.split(/\.(?:\s|$)/)
  for (const s of sentences) {
    if (/income|foreign|transaction|fx fee/i.test(s) && s.trim().length > 10) {
      console.log(' ', s.trim().slice(0, 200))
    }
  }
}

main().catch(console.error)

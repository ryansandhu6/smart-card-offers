// scripts/run-scrapers.ts
// Run this manually to trigger all scrapers: npx ts-node scripts/run-scrapers.ts
// Or pass a single scraper name: npx ts-node scripts/run-scrapers.ts amex

import { AmexScraper } from '../scrapers/amex'
import { TDScraper } from '../scrapers/td'
import { ScotiabankScraper, BMOScraper, RBCScraper, CIBCScraper } from '../scrapers/banks'
import { RatehubScraper, BigBankMortgageScraper } from '../scrapers/mortgage-rates'
import { MintFlyingScraper, RatehubCardsScraper } from '../scrapers/aggregators'
import { ChurningCanadaScraper } from '../scrapers/churningcanada'
import { NationalBankScraper, TangerineScraper } from '../scrapers/playwright-scraper'

const CARD_SCRAPERS = {
  amex:          () => new AmexScraper(),
  td:            () => new TDScraper(),
  scotiabank:    () => new ScotiabankScraper(),
  bmo:           () => new BMOScraper(),
  rbc:           () => new RBCScraper(),
  cibc:          () => new CIBCScraper(),
  'national-bank': () => new NationalBankScraper(),
  tangerine:     () => new TangerineScraper(),
}

const MORTGAGE_SCRAPERS = {
  ratehub: () => new RatehubScraper(),
  'big-bank-mortgage': () => new BigBankMortgageScraper(),
}

// Aggregator scrapers — public listing pages, robots.txt verified
// greedyrates skipped: redirects to money.ca which returns 403 on robots.txt
// creditcardgenius: Angular SPA — consistently returns 0 (removed)
// flytrippers: JS-rendered content — consistently returns 0 (removed)
const AGGREGATOR_SCRAPERS = {
  mintflying:      () => new MintFlyingScraper(),
  'ratehub-cards': () => new RatehubCardsScraper(),
  churningcanada:  () => new ChurningCanadaScraper(),
}

async function main() {
  const target = process.argv[2] // e.g. "amex" or "ratehub"

  if (target) {
    const factory = { ...CARD_SCRAPERS, ...MORTGAGE_SCRAPERS, ...AGGREGATOR_SCRAPERS }[target]
    if (!factory) {
      console.error(`Unknown scraper: ${target}`)
      console.log('Available:', Object.keys({ ...CARD_SCRAPERS, ...MORTGAGE_SCRAPERS, ...AGGREGATOR_SCRAPERS }).join(', '))
      process.exit(1)
    }
    const result = await factory().run()
    console.log('\nResult:', JSON.stringify(result, null, 2))
    return
  }

  // Run all
  console.log('=== Running all scrapers ===\n')

  const allResults = []

  for (const [name, factory] of Object.entries(CARD_SCRAPERS)) {
    console.log(`\n--- ${name} ---`)
    const result = await factory().run()
    allResults.push(result)
    // Wait between scrapers to be polite
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log('\n=== Mortgage Rate Scrapers ===\n')

  for (const [name, factory] of Object.entries(MORTGAGE_SCRAPERS)) {
    console.log(`\n--- ${name} ---`)
    const result = await factory().run()
    allResults.push(result)
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log('\n=== Aggregator Scrapers ===\n')

  for (const [name, factory] of Object.entries(AGGREGATOR_SCRAPERS)) {
    console.log(`\n--- ${name} ---`)
    const result = await factory().run()
    allResults.push(result)
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log('\n=== Summary ===')
  for (const r of allResults) {
    const icon = r.status === 'success' ? '✅' : r.status === 'partial' ? '⚠️' : '❌'
    console.log(`${icon} ${r.scraper}: ${r.records_updated}/${r.records_found} records (${r.duration_ms}ms)`)
  }
}

main().catch(console.error)

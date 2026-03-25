// scripts/run-scrapers.ts
// Run this manually to trigger all scrapers: npx ts-node scripts/run-scrapers.ts
// Or pass a single scraper name: npx ts-node scripts/run-scrapers.ts amex

import { AmexScraper } from '../scrapers/amex'
import { TDScraper } from '../scrapers/td'
import { MintFlyingScraper, PrinceOfTravelScraper } from '../scrapers/aggregators'
import { ChurningCanadaScraper } from '../scrapers/churningcanada'

const SCRAPERS = {
  amex:           () => new AmexScraper(),
  td:             () => new TDScraper(),
  churningcanada: () => new ChurningCanadaScraper(),
  mintflying:     () => new MintFlyingScraper(),
  princeoftravel: () => new PrinceOfTravelScraper(),
}

async function main() {
  const target = process.argv[2]

  if (target) {
    const factory = SCRAPERS[target as keyof typeof SCRAPERS]
    if (!factory) {
      console.error(`Unknown scraper: ${target}`)
      console.log('Available:', Object.keys(SCRAPERS).join(', '))
      process.exit(1)
    }
    const result = await factory().run()
    console.log('\nResult:', JSON.stringify(result, null, 2))
    return
  }

  // Run all
  console.log('=== Running all scrapers ===\n')

  const allResults = []

  for (const [name, factory] of Object.entries(SCRAPERS)) {
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

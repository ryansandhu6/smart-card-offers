// app/api/scrape/route.ts
// POST /api/scrape — runs all scrapers in sequence.
// Protected by Authorization: Bearer {CRON_SECRET}.
// Triggered by Vercel cron (vercel.json) or manually.

import { NextRequest, NextResponse } from 'next/server'
import { ChurningCanadaScraper } from '@/scrapers/churningcanada'
import { AmexScraper } from '@/scrapers/amex'
import { TDScraper } from '@/scrapers/td'
import { MintFlyingScraper, PrinceOfTravelScraper } from '@/scrapers/aggregators'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ran_at = new Date().toISOString()
  const results: Array<Record<string, unknown>> = []

  // Run scrapers in priority order: community data → bank-direct → aggregators
  const scrapers = [
    new ChurningCanadaScraper(),
    new AmexScraper(),
    new TDScraper(),
    new MintFlyingScraper(),
    new PrinceOfTravelScraper(),
  ]

  for (const scraper of scrapers) {
    try {
      const result = await scraper.run()
      results.push(result as unknown as Record<string, unknown>)
    } catch (err) {
      results.push({
        scraper: scraper.name,
        status: 'failed',
        records_found: 0,
        records_updated: 0,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: 0,
      })
    }
  }

  const total_updated = results.reduce((sum, r) => sum + ((r.records_updated as number) ?? 0), 0)

  return NextResponse.json({ ran_at, total_scrapers: results.length, total_updated, results })
}

// Vercel cron calls GET — forward to POST handler with the cron auth header
export async function GET(req: NextRequest) {
  return POST(req)
}

// app/api/scrape/route.ts
// POST /api/scrape — manual "run all 5 scrapers" endpoint.
// Protected by Authorization: Bearer {CRON_SECRET}.
//
// Daily cron is split into two shorter runs:
//   POST /api/scrape/fast  (06:00 UTC) — churningcanada, amex, td  (~30 s)
//   POST /api/scrape/deep  (07:00 UTC) — mintflying, princeoftravel (~10 min)
//
// This route runs all 5 in sequence for manual testing / one-off runs.

import { NextRequest, NextResponse } from 'next/server'
import { ChurningCanadaScraper } from '@/scrapers/churningcanada'
import { MintFlyingScraper, PrinceOfTravelScraper } from '@/scrapers/aggregators'
import { sendAlert } from '@/lib/alert'

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return !!(process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`)
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ran_at = new Date().toISOString()
  const results: Array<Record<string, unknown>> = []

  const scrapers = [
    new ChurningCanadaScraper(),
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
  const anyFailed = results.some(r => r.status === 'failed')

  if (total_updated === 0 || anyFailed) {
    const failedList = results
      .filter(r => r.status === 'failed')
      .map(r => `  ${r.scraper}: ${r.error}`)
      .join('\n')
    await sendAlert(
      `Scraper run issues — total_updated: ${total_updated}`,
      `ran_at: ${ran_at}\ntotal_updated: ${total_updated}\n\nFailed scrapers:\n${failedList || '  (none failed, but 0 records updated)'}\n\nFull results:\n${JSON.stringify(results, null, 2)}`
    )
  }

  return NextResponse.json({ ran_at, total_scrapers: results.length, total_updated, results })
}

// Vercel cron calls GET — forward to POST handler with the cron auth header
export async function GET(req: NextRequest) {
  return POST(req)
}

// app/api/scrape/fast/route.ts
// POST /api/scrape/fast — fast daily scrape (~30 seconds).
// Runs: churningcanada (SHA-gated), amex (bank-direct), td (bank-direct).
// Triggered by Vercel cron at 06:00 UTC daily.
// Protected by Authorization: Bearer {CRON_SECRET}.

import { NextRequest, NextResponse } from 'next/server'
import { ChurningCanadaScraper } from '@/scrapers/churningcanada'
import { AmexScraper } from '@/scrapers/amex'
import { TDScraper } from '@/scrapers/td'
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
    new AmexScraper(),
    new TDScraper(),
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

  if (anyFailed) {
    const failedList = results
      .filter(r => r.status === 'failed')
      .map(r => `  ${r.scraper}: ${r.error}`)
      .join('\n')
    await sendAlert(
      `[fast scrape] Scraper failures detected`,
      `ran_at: ${ran_at}\ntotal_updated: ${total_updated}\n\nFailed scrapers:\n${failedList}\n\nFull results:\n${JSON.stringify(results, null, 2)}`
    )
  }

  return NextResponse.json({ ran_at, route: 'fast', total_scrapers: results.length, total_updated, results })
}

// Vercel cron calls GET — forward to POST
export async function GET(req: NextRequest) {
  return POST(req)
}

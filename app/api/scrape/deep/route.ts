// app/api/scrape/deep/route.ts
// POST /api/scrape/deep — deep daily scrape (~10 minutes).
// Runs: mintflying (aggregator), princeoftravel (curated — visits 102 card pages).
// Triggered by Vercel cron at 07:00 UTC daily (one hour after /api/scrape/fast).
// Protected by Authorization: Bearer {CRON_SECRET}.
//
// Canary check: if Prince of Travel returns fewer than 50 cards, the site's
// HTML layout has likely changed. An alert email is sent immediately so the
// scraper can be investigated before offers go stale.

import { NextRequest, NextResponse } from 'next/server'
import { MintFlyingScraper, PrinceOfTravelScraper } from '@/scrapers/aggregators'
import { sendAlert } from '@/lib/alert'

const POT_CANARY_MIN = 50   // alert if PoT returns fewer cards than this

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

  // ── Prince of Travel canary check ──────────────────────────────────────────
  // PoT normally returns 90–102 cards. Fewer than 50 means the HTML layout
  // has likely changed and the scraper is silently broken.
  const potResult = results.find(r => r.scraper === 'princeoftravel')
  if (potResult) {
    const found = potResult.records_found as number
    if (found < POT_CANARY_MIN) {
      console.error(`[deep scrape] PoT canary triggered: only ${found} cards returned (min ${POT_CANARY_MIN})`)
      await sendAlert(
        `Prince of Travel scraper returned only ${found} cards — layout may have changed`,
        `ran_at: ${ran_at}\nrecords_found: ${found}\nrecords_updated: ${potResult.records_updated}\nexpected: ≥${POT_CANARY_MIN}\n\nAction: check https://princeoftravel.com/credit-cards/ and inspect scrapers/aggregators.ts`
      )
    }
  }

  // ── General failure alert ───────────────────────────────────────────────────
  const anyFailed = results.some(r => r.status === 'failed')
  if (anyFailed || total_updated === 0) {
    const failedList = results
      .filter(r => r.status === 'failed')
      .map(r => `  ${r.scraper}: ${r.error}`)
      .join('\n')
    await sendAlert(
      `[deep scrape] Issues detected — total_updated: ${total_updated}`,
      `ran_at: ${ran_at}\ntotal_updated: ${total_updated}\n\nFailed scrapers:\n${failedList || '  (none failed, but 0 records updated)'}\n\nFull results:\n${JSON.stringify(results, null, 2)}`
    )
  }

  return NextResponse.json({ ran_at, route: 'deep', total_scrapers: results.length, total_updated, results })
}

// Vercel cron calls GET — forward to POST
export async function GET(req: NextRequest) {
  return POST(req)
}

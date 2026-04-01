// POST /api/admin/scrape — trigger a named scraper from the admin UI.
// Protected by admin session cookie (not CRON_SECRET) so CRON_SECRET
// is never sent to the browser.
import { NextRequest, NextResponse } from 'next/server'
import { ChurningCanadaScraper } from '@/scrapers/churningcanada'
import { MintFlyingScraper, PrinceOfTravelScraper } from '@/scrapers/aggregators'

export const maxDuration = 300

const SCRAPERS = {
  churningcanada: () => new ChurningCanadaScraper(),
  mintflying:     () => new MintFlyingScraper(),
  princeoftravel: () => new PrinceOfTravelScraper(),
} as const

export async function POST(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  if (!process.env.ADMIN_PASSWORD || session !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { scraper: name } = await req.json() as { scraper: string }
  const factory = SCRAPERS[name as keyof typeof SCRAPERS]
  if (!factory) {
    return NextResponse.json({ error: `Unknown scraper: ${name}` }, { status: 400 })
  }

  try {
    const result = await factory().run()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

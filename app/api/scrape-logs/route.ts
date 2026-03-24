// app/api/scrape-logs/route.ts
// GET /api/scrape-logs — last 50 scrape log entries, grouped by scraper name

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('scrape_logs')
      .select('*')
      // Exclude internal SHA tracking entries
      .neq('scraper_name', 'churningcanada-sha')
      .order('ran_at', { ascending: false })
      .limit(50)

    if (error) throw error

    // Group by scraper_name: latest entry per scraper at the top
    const by_scraper: Record<string, typeof data> = {}
    for (const row of data ?? []) {
      if (!by_scraper[row.scraper_name]) by_scraper[row.scraper_name] = []
      by_scraper[row.scraper_name].push(row)
    }

    return NextResponse.json({ logs: data, by_scraper, count: data?.length ?? 0 })
  } catch (err) {
    console.error('/api/scrape-logs error:', err)
    return NextResponse.json({ error: 'Failed to fetch scrape logs' }, { status: 500 })
  }
}

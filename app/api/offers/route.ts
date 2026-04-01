// Public API — for external frontend use only
import { NextRequest, NextResponse } from 'next/server'
import { getActiveOffers, getOfferHistoryStats } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limitedOnly = searchParams.get('limited') === 'true'
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))
  try {
    const { data: offers, total } = await getActiveOffers(limitedOnly, page, limit)

    // Enrich with is_better_than_usual from offer_history_stats view
    const cardIds = [...new Set(offers.map((o: any) => o.card_id).filter(Boolean))]
    const statsMap = await getOfferHistoryStats(cardIds as string[])

    const enriched = offers.map((o: any) => {
      const stats = statsMap.get(`${o.card_id}:${o.offer_type}`)
      let is_better_than_usual = false
      if (stats) {
        if (o.points_value   != null && stats.avg_points_12mo   != null && o.points_value   > stats.avg_points_12mo)   is_better_than_usual = true
        if (o.cashback_value != null && stats.avg_cashback_12mo != null && o.cashback_value > stats.avg_cashback_12mo) is_better_than_usual = true
      }
      return { ...o, is_better_than_usual }
    })

    return NextResponse.json({ offers: enriched, count: enriched.length, total, page, limit })
  } catch (err) {
    console.error('/api/offers error:', err)
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
  }
}

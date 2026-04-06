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

    // Group by card — one object per card with welcome_bonus + additional_offers nested.
    // Offer ordering from getActiveOffers (source_priority ASC, points DESC) is preserved,
    // so the first welcome_bonus seen per card is always the highest-trust one.
    const cardMap = new Map<string, any>()
    for (const offer of enriched) {
      const { card, card_id, ...offerData } = offer
      if (!cardMap.has(card_id)) {
        cardMap.set(card_id, {
          ...card,
          has_no_bonus: card.has_no_bonus ?? false,
          welcome_bonus: null,
          additional_offers: [],
        })
      }
      const entry = cardMap.get(card_id)!
      if (offer.offer_type === 'welcome_bonus' && !entry.welcome_bonus) {
        entry.welcome_bonus = { ...offerData, card_id }
      } else if (offer.offer_type !== 'welcome_bonus') {
        entry.additional_offers.push({ ...offerData, card_id })
      }
    }

    const cards = [...cardMap.values()]
    return NextResponse.json({ cards, count: cards.length, total, page, limit })
  } catch (err) {
    console.error('/api/offers error:', err)
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
  }
}

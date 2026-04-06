// Public API — for external frontend use only
import { NextRequest, NextResponse } from 'next/server'
import { getCards, searchCards } from '@/lib/supabase'

/** Group a card's flat current_offers array into typed sub-fields. */
function groupCardOffers(card: any) {
  const offers: any[] = card.current_offers ?? []
  const welcome_bonus    = offers.find(o => o.offer_type === 'welcome_bonus') ?? null
  const additional_offers = offers.filter(o => o.offer_type !== 'welcome_bonus')
  const { current_offers, ...rest } = card
  return { ...rest, welcome_bonus, additional_offers }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const q = searchParams.get('q')?.trim() ?? ''

  const filters = {
    issuer_slug:  searchParams.get('issuer') ?? undefined,
    tier:         searchParams.get('tier') ?? undefined,
    rewards_type: searchParams.get('rewards_type') ?? undefined,
    tags:         searchParams.get('tags')?.split(',').filter(Boolean),
    is_featured:  searchParams.get('featured') === 'true' ? true : undefined,
    page:         Math.max(1, parseInt(searchParams.get('page')  ?? '1')  || 1),
    limit:        Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20') || 20)),
  }

  try {
    if (q) {
      const { data: raw, total } = await searchCards(q, filters)
      const cards = raw.map(groupCardOffers)
      return NextResponse.json({ cards, count: cards.length, total, query: q })
    }

    const { data: raw, total } = await getCards(filters)
    const cards = raw.map(groupCardOffers)
    return NextResponse.json({ cards, count: cards.length, total })
  } catch (err) {
    console.error('/api/cards error:', err)
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 })
  }
}

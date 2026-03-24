import { NextRequest, NextResponse } from 'next/server'
import { getCards } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const filters = {
    issuer_slug: searchParams.get('issuer') ?? undefined,
    tier: searchParams.get('tier') ?? undefined,
    rewards_type: searchParams.get('rewards_type') ?? undefined,
    tags: searchParams.get('tags')?.split(',').filter(Boolean),
    is_featured: searchParams.get('featured') === 'true' ? true : undefined,
    page:  parseInt(searchParams.get('page')  ?? '1'),
    limit: parseInt(searchParams.get('limit') ?? '20'),
  }

  try {
    const cards = await getCards(filters)
    return NextResponse.json({ cards, count: cards.length })
  } catch (err) {
    console.error('/api/cards error:', err)
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 })
  }
}

// Public API — for external frontend use only
// app/api/cards/[slug]/history/route.ts
// GET /api/cards/:slug/history — offer history and stats for a single card

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    // Resolve slug → card
    const { data: card, error: cardError } = await supabaseAdmin
      .from('credit_cards')
      .select('id, name, slug')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()

    if (cardError) throw cardError
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    // Fetch offer history and stats in parallel
    const [historyResult, statsResult] = await Promise.all([
      supabaseAdmin
        .from('offer_history')
        .select('*')
        .eq('card_id', card.id)
        .order('first_seen_at', { ascending: false }),
      supabaseAdmin
        .from('offer_history_stats')
        .select('*')
        .eq('card_id', card.id),
    ])

    if (historyResult.error) throw historyResult.error
    if (statsResult.error)  throw statsResult.error

    return NextResponse.json({
      card:    { id: card.id, name: card.name, slug: card.slug },
      history: historyResult.data ?? [],
      stats:   statsResult.data  ?? [],
    })
  } catch (err) {
    console.error('/api/cards/[slug]/history error:', err)
    return NextResponse.json({ error: 'Failed to fetch card history' }, { status: 500 })
  }
}

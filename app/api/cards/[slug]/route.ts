// app/api/cards/[slug]/route.ts
// GET /api/cards/:slug — single card with all active offers, issuer, and full metadata

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const { data, error } = await supabaseAdmin
      .from('credit_cards')
      .select(`
        *,
        issuer:issuers(*),
        offers:card_offers(
          id, offer_type, headline, details,
          points_value, cashback_value,
          spend_requirement, spend_timeframe_days,
          extra_perks, is_limited_time, expires_at,
          is_verified, source_priority, last_seen_at,
          confidence_score, source_url, scraped_at
        )
      `)
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('card_offers.is_active', true)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    return NextResponse.json({ card: data })
  } catch (err) {
    console.error('/api/cards/[slug] error:', err)
    return NextResponse.json({ error: 'Failed to fetch card' }, { status: 500 })
  }
}

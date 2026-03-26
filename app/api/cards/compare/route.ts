// app/api/cards/compare/route.ts
// GET /api/cards/compare?slugs=amex-cobalt,td-aeroplan-visa-infinite,rbc-avion-visa-infinite
// Returns 2–3 cards side-by-side with their best active offer and is_better_than_usual flag.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, getOfferHistoryStats } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('slugs') ?? ''
  const slugs = raw.split(',').map(s => s.trim()).filter(Boolean)

  const uniqueSlugs = [...new Set(slugs)]
  if (uniqueSlugs.length !== slugs.length) {
    return NextResponse.json({ error: 'Duplicate slugs are not allowed' }, { status: 400 })
  }

  if (slugs.length < 2) return NextResponse.json({ error: 'Provide 2–3 slugs' }, { status: 400 })
  if (slugs.length > 3) return NextResponse.json({ error: 'Maximum 3 slugs allowed' }, { status: 400 })

  try {
    const { data, error } = await supabaseAdmin
      .from('credit_cards')
      .select(`
        id, name, slug, image_url, referral_url, annual_fee,
        rewards_type, rewards_program, earn_rate_base, earn_rate_multipliers,
        lounge_access, travel_insurance, tier,
        issuer:issuers(name, slug),
        offers:card_offers(
          offer_type, headline, points_value, cashback_value,
          spend_requirement, spend_timeframe_days, is_limited_time, is_active
        )
      `)
      .in('slug', slugs)
      .eq('is_active', true)
      .eq('card_offers.is_active', true)

    if (error) throw error

    // 404 if any requested slug is missing or inactive
    const missing = slugs.filter(s => !data?.find((c: any) => c.slug === s))
    if (missing.length) {
      return NextResponse.json(
        { error: `Card(s) not found: ${missing.join(', ')}` },
        { status: 404 }
      )
    }

    const cardIds = (data ?? []).map((c: any) => c.id)
    const statsMap = await getOfferHistoryStats(cardIds)

    // Build response in slug param order
    const cards = slugs.map(slug => {
      const card = data!.find((c: any) => c.slug === slug)!
      const offers: any[] = card.offers ?? []

      // Best offer: highest points for points/hybrid, highest cashback for cashback
      const sorted = [...offers].sort((a, b) =>
        card.rewards_type === 'cashback'
          ? (b.cashback_value ?? 0) - (a.cashback_value ?? 0)
          : (b.points_value  ?? 0) - (a.points_value  ?? 0)
      )
      const top = sorted[0] ?? null

      let best_offer = null
      if (top) {
        const stats = statsMap.get(`${card.id}:${top.offer_type}`)
        let is_better_than_usual = false
        if (stats) {
          if (top.points_value   != null && stats.avg_points_12mo   != null && top.points_value   > stats.avg_points_12mo)   is_better_than_usual = true
          if (top.cashback_value != null && stats.avg_cashback_12mo != null && top.cashback_value > stats.avg_cashback_12mo) is_better_than_usual = true
        }
        best_offer = {
          offer_type:           top.offer_type,
          headline:             top.headline,
          points_value:         top.points_value         ?? null,
          cashback_value:       top.cashback_value       ?? null,
          spend_requirement:    top.spend_requirement    ?? null,
          spend_timeframe_days: top.spend_timeframe_days ?? null,
          is_limited_time:      top.is_limited_time,
          is_better_than_usual,
        }
      }

      return {
        id:                    card.id,
        name:                  card.name,
        slug:                  card.slug,
        image_url:             card.image_url             ?? null,
        referral_url:          card.referral_url          ?? null,
        annual_fee:            card.annual_fee,
        rewards_type:          card.rewards_type,
        rewards_program:       card.rewards_program       ?? null,
        earn_rate_base:        card.earn_rate_base        ?? null,
        earn_rate_multipliers: card.earn_rate_multipliers ?? null,
        lounge_access:         card.lounge_access,
        travel_insurance:      card.travel_insurance,
        tier:                  card.tier,
        issuer:                card.issuer,
        best_offer,
      }
    })

    return NextResponse.json({ cards })
  } catch (err) {
    console.error('/api/cards/compare error:', err)
    return NextResponse.json({ error: 'Failed to compare cards' }, { status: 500 })
  }
}

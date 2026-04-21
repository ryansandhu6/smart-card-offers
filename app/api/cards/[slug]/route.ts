// Public API — for external frontend use only
// app/api/cards/[slug]/route.ts
// GET /api/cards/:slug — single card with all active offers, issuer, and full metadata

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, getOfferHistoryStats } from '@/lib/supabase'

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
        current_offers:card_offers(
          id, offer_type, headline, details,
          points_value, cashback_value,
          spend_requirement, spend_timeframe_days,
          extra_perks, is_limited_time, expires_at,
          is_verified, source_priority, last_seen_at,
          confidence_score, source_url, scraped_at,
          is_monthly_bonus, monthly_points_value, monthly_spend_requirement,
          monthly_cashback_value, bonus_months, start_month,
          review_reason, content_source
        ),
        insurance:card_insurance(coverage_type, maximum, details),
        earn_rates:card_earn_rates(category, rate_multiplier, details),
        transfer_partners:card_transfer_partners(partner_name, ratio, transfer_time, alliance, best_for),
        credits:card_credits(credit_type, amount, details),
        lounge_access:card_lounge_access(lounge_network, visits_per_year, guest_policy, details)
      `)
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('card_offers.is_active', true)
      .eq('card_offers.review_status', 'approved')
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    // Enrich each offer with is_better_than_usual from offer_history_stats
    const statsMap = await getOfferHistoryStats([data.id])
    const current_offers = (data.current_offers ?? []).map((o: any) => {
      const stats = statsMap.get(`${data.id}:${o.offer_type}`)
      let is_better_than_usual = false
      if (stats) {
        if (o.points_value   != null && stats.avg_points_12mo   != null && o.points_value   > stats.avg_points_12mo)   is_better_than_usual = true
        if (o.cashback_value != null && stats.avg_cashback_12mo != null && o.cashback_value > stats.avg_cashback_12mo) is_better_than_usual = true
      }
      return { ...o, is_better_than_usual }
    })

    return NextResponse.json({ card: { ...data, current_offers } })
  } catch (err) {
    console.error('/api/cards/[slug] error:', err)
    return NextResponse.json({ error: 'Failed to fetch card' }, { status: 500 })
  }
}

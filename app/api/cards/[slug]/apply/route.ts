// Public API — for external frontend use only
// app/api/cards/[slug]/apply/route.ts
// GET /api/cards/:slug/apply
//
// 1. Look up card by slug — 404 if not found or inactive
// 2. 400 if card has no referral_url
// 3. Log click to referral_clicks (non-blocking — never fails the redirect)
// 4. 302 redirect to card's referral_url

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // ── 1. Look up card ────────────────────────────────────────────────────────
  const { data: card, error } = await supabaseAdmin
    .from('credit_cards')
    .select('id, referral_url, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error(`/api/cards/${slug}/apply DB error:`, error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!card || !card.is_active) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  }

  // ── 2. Require referral_url ────────────────────────────────────────────────
  if (!card.referral_url) {
    return NextResponse.json(
      { error: 'No referral URL configured for this card' },
      { status: 400 }
    )
  }

  // ── 3. Log click (fire-and-forget — never blocks or fails the redirect) ────
  const sp = req.nextUrl.searchParams
  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const ip_hash = createHash('sha256').update(rawIp).digest('hex')

  supabaseAdmin
    .from('referral_clicks')
    .insert({
      card_id:      card.id,
      source_page:  sp.get('source') ?? req.headers.get('referer') ?? null,
      utm_source:   sp.get('utm_source')   ?? null,
      utm_medium:   sp.get('utm_medium')   ?? null,
      utm_campaign: sp.get('utm_campaign') ?? null,
      ip_hash,
      user_agent:   req.headers.get('user-agent') ?? null,
    })
    .then(({ error: logErr }) => {
      if (logErr) console.warn(`/api/cards/${slug}/apply click log failed:`, logErr.message)
    })

  // ── 4. Redirect ────────────────────────────────────────────────────────────
  return NextResponse.redirect(card.referral_url, { status: 302 })
}

// Public API — for external frontend use only
// app/api/track-click/route.ts
// POST /api/track-click — logs a referral click to referral_clicks table.
// IP is SHA-256 hashed with IP_HASH_SALT for privacy compliance.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { card_id, offer_id, source_page } = body as {
      card_id?: string
      offer_id?: string
      source_page?: string
    }

    // Prefer leftmost IP from X-Forwarded-For (set by Vercel edge)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      ''

    // Hash IP + salt so we can't reconstruct the original address
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(ip + (process.env.IP_HASH_SALT ?? 'default-salt'))
    )
    const ip_hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16)

    const { error } = await supabaseAdmin.from('referral_clicks').insert({
      card_id:    card_id  ?? null,
      offer_id:   offer_id ?? null,
      source_page: source_page ?? null,
      ip_hash,
      user_agent: req.headers.get('user-agent'),
    })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('/api/track-click error:', err)
    return NextResponse.json({ error: 'Failed to track click' }, { status: 500 })
  }
}

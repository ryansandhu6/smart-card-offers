// Public API — for external frontend use only
// app/api/newsletter/confirm/route.ts
// GET /api/newsletter/confirm?token=<hex>
//
// Activates a pending subscriber.
// - 400 if token is missing or not found
// - 200 if already confirmed (idempotent)
// - Sets is_confirmed=true, confirmed_at=now(), clears confirmation_token

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin }             from '@/lib/supabase'

function getAppUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()

  if (!token) {
    return NextResponse.json({ error: 'Missing confirmation token' }, { status: 400 })
  }

  // Look up by token — no is_confirmed filter so we can detect already-confirmed
  const { data: subscriber, error: lookupError } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select('id, is_confirmed')
    .eq('confirmation_token', token)
    .maybeSingle()

  if (lookupError) {
    console.error('[newsletter/confirm] lookup error:', lookupError.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!subscriber) {
    return NextResponse.json(
      { error: 'Invalid or expired confirmation token' },
      { status: 400 }
    )
  }

  // Idempotent: already confirmed is not an error
  if (subscriber.is_confirmed) {
    return NextResponse.redirect(`${getAppUrl(req)}/?newsletter=already_confirmed`)
  }

  // Activate subscriber and clear the one-time token
  const { error: updateError } = await supabaseAdmin
    .from('newsletter_subscribers')
    .update({
      is_confirmed:       true,
      confirmed_at:       new Date().toISOString(),
      confirmation_token: null,
    })
    .eq('id', subscriber.id)

  if (updateError) {
    console.error('[newsletter/confirm] update error:', updateError.message)
    return NextResponse.json({ error: 'Failed to confirm subscription' }, { status: 500 })
  }

  return NextResponse.redirect(`${getAppUrl(req)}/?newsletter=confirmed`)
}

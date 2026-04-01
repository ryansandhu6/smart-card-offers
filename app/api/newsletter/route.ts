// Public API — for external frontend use only
// app/api/newsletter/route.ts
// POST /api/newsletter — double opt-in signup (CASL compliant)
//
// Flow:
//   1. Rate-limit by IP (3/hour)
//   2. Validate email
//   3. If already confirmed → return 200, no email sent (idempotent)
//   4. If pending (unconfirmed) → regenerate token, resend confirmation
//   5. If new → insert with is_confirmed=false, send confirmation email
//
// Subscribers with is_confirmed=false must NOT receive marketing emails.

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes }               from 'crypto'
import { Resend }                    from 'resend'
import { supabaseAdmin }             from '@/lib/supabase'
import { checkRateLimit }            from '@/lib/rate-limit'

const resend = new Resend(process.env.RESEND_API_KEY)

function getAppUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  // ── 1. Rate limit ───────────────────────────────────────────────────────────
  const ip     = getIp(req)
  const rl     = await checkRateLimit(ip)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many signup attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      }
    )
  }

  // ── 2. Validate input ───────────────────────────────────────────────────────
  let body: { email?: string; first_name?: string; source?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, first_name, source } = body
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }
  const normalizedEmail = email.toLowerCase().trim()

  // ── 3. Check existing subscriber ───────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select('id, is_confirmed')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existing?.is_confirmed) {
    // Already confirmed — don't send another email, just acknowledge
    return NextResponse.json({ success: true, status: 'already_confirmed' })
  }

  // ── 4. Generate confirmation token ─────────────────────────────────────────
  const token = randomBytes(32).toString('hex')
  const now   = new Date().toISOString()

  if (existing) {
    // Pending subscriber — refresh token and resend
    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({ confirmation_token: token, subscribed_at: now })
      .eq('id', existing.id)
    if (error) {
      console.error('[newsletter] token refresh failed:', error.message)
      return NextResponse.json({ error: 'Failed to process signup' }, { status: 500 })
    }
  } else {
    // New subscriber — insert with is_confirmed=false
    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .insert({
        email:              normalizedEmail,
        first_name:         first_name ?? null,
        source:             source     ?? null,
        is_confirmed:       false,
        confirmation_token: token,
        subscribed_at:      now,
      })
    if (error) {
      console.error('[newsletter] insert failed:', error.message)
      return NextResponse.json({ error: 'Failed to process signup' }, { status: 500 })
    }
  }

  // ── 5. Send confirmation email ──────────────────────────────────────────────
  const confirmUrl = `${getAppUrl(req)}/api/newsletter/confirm?token=${token}`
  let email_sent   = false

  try {
    const { error: emailError } = await resend.emails.send({
      from:    'Smart Card Offers <hello@smartcardoffers.ca>',
      to:      normalizedEmail,
      subject: 'Confirm your Smart Card Offers subscription',
      html: `
        <h1>One more step${first_name ? `, ${first_name}` : ''}!</h1>
        <p>Click the button below to confirm your subscription to Canada's best credit card offers newsletter.</p>
        <p style="margin: 32px 0;">
          <a href="${confirmUrl}"
             style="background:#1a56db;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;">
            Confirm my subscription
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${confirmUrl}" style="color:#1a56db;">${confirmUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
        <p style="color:#9ca3af;font-size:12px;">
          If you did not request this email, you can safely ignore it.
          You will not receive any emails from us unless you confirm above.
        </p>
      `,
    })
    if (emailError) {
      console.error('[newsletter] Resend error:', emailError)
    } else {
      email_sent = true
    }
  } catch (err) {
    console.error('[newsletter] Failed to send confirmation email:', err)
  }

  return NextResponse.json({
    success:    true,
    status:     'confirmation_sent',
    email_sent,
  })
}

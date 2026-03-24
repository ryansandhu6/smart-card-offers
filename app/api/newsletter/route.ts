import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { email, first_name, source } = await req.json()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const { error: dbError } = await supabaseAdmin
    .from('newsletter_subscribers')
    .upsert(
      { email, first_name, source, subscribed_at: new Date().toISOString() },
      { onConflict: 'email' }
    )

  if (dbError) {
    return NextResponse.json({ error: 'Failed to save subscriber' }, { status: 500 })
  }

  await resend.emails.send({
    from: 'Smart Card Offers <hello@smartcardoffers.ca>',
    to: email,
    subject: 'Welcome to Smart Card Offers',
    html: `
      <h1>Welcome${first_name ? `, ${first_name}` : ''}!</h1>
      <p>You're now subscribed to Canada's best credit card offers newsletter.</p>
      <p>We'll send you the best welcome bonuses, limited-time offers, and points transfer tips.</p>
    `,
  })

  return NextResponse.json({ success: true })
}

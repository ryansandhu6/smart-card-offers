// ============================================================
// app/api/cards/route.ts
// GET /api/cards — Returns all active credit cards with current offers
// ============================================================

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
  }

  try {
    const cards = await getCards(filters)
    return NextResponse.json({ cards, count: cards.length })
  } catch (err) {
    console.error('/api/cards error:', err)
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 })
  }
}

// ============================================================
// app/api/offers/route.ts
// GET /api/offers — Returns active offers, limited-time first
// ============================================================

// import { NextRequest, NextResponse } from 'next/server'
// import { getActiveOffers } from '@/lib/supabase'
//
// export async function GET(req: NextRequest) {
//   const limitedOnly = req.nextUrl.searchParams.get('limited') === 'true'
//   try {
//     const offers = await getActiveOffers(limitedOnly)
//     return NextResponse.json({ offers, count: offers.length })
//   } catch (err) {
//     return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
//   }
// }


// ============================================================
// app/api/mortgage-rates/route.ts
// GET /api/mortgage-rates — Returns latest mortgage rates grouped by type/term
// ============================================================

// import { getMortgageRates } from '@/lib/supabase'
//
// export async function GET() {
//   try {
//     const rates = await getMortgageRates()
//
//     // Group by rate_type, then term_years
//     const grouped = rates.reduce((acc, rate) => {
//       const key = rate.rate_type
//       if (!acc[key]) acc[key] = {}
//       if (!acc[key][rate.term_years]) acc[key][rate.term_years] = []
//       acc[key][rate.term_years].push(rate)
//       return acc
//     }, {} as Record<string, Record<number, any[]>>)
//
//     return NextResponse.json({ rates, grouped })
//   } catch (err) {
//     return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 })
//   }
// }


// ============================================================
// app/api/newsletter/route.ts
// POST /api/newsletter — Subscribe to newsletter (Resend)
// ============================================================

// import { Resend } from 'resend'
// import { supabaseAdmin } from '@/lib/supabase'
//
// const resend = new Resend(process.env.RESEND_API_KEY)
//
// export async function POST(req: NextRequest) {
//   const { email, first_name, source } = await req.json()
//
//   if (!email || !email.includes('@')) {
//     return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
//   }
//
//   // Save to Supabase
//   const { error: dbError } = await supabaseAdmin
//     .from('newsletter_subscribers')
//     .upsert({ email, first_name, source, subscribed_at: new Date().toISOString() })
//
//   if (dbError) {
//     return NextResponse.json({ error: 'Failed to save subscriber' }, { status: 500 })
//   }
//
//   // Add to Resend audience
//   await resend.contacts.create({
//     email,
//     firstName: first_name,
//     audienceId: process.env.RESEND_AUDIENCE_ID!,
//   })
//
//   // Send welcome email
//   await resend.emails.send({
//     from: 'Smart Card Offers <hello@smartcardoffers.ca>',
//     to: email,
//     subject: 'Welcome to Smart Card Offers 🎉',
//     html: `
//       <h1>Welcome${first_name ? `, ${first_name}` : ''}!</h1>
//       <p>You're now subscribed to Canada's best credit card churn newsletter.</p>
//       <p>We'll send you the best welcome bonuses, limited-time offers, and points transfer tips.</p>
//     `,
//   })
//
//   return NextResponse.json({ success: true })
// }


// ============================================================
// app/api/scrape/route.ts
// POST /api/scrape — Vercel cron job endpoint (runs all scrapers)
// Protect with CRON_SECRET to prevent unauthorized triggers
// ============================================================

// import { AmexScraper } from '@/scrapers/amex'
// import { TDScraper } from '@/scrapers/td'
// import { ScotiabankScraper, BMOScraper, RBCScraper, CIBCScraper } from '@/scrapers/banks'
// import { RatehubScraper, BigBankMortgageScraper } from '@/scrapers/mortgage-rates'
//
// export async function POST(req: NextRequest) {
//   // Verify cron secret
//   const authHeader = req.headers.get('authorization')
//   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
//     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
//   }
//
//   const scrapers = [
//     new AmexScraper(),
//     new TDScraper(),
//     new ScotiabankScraper(),
//     new BMOScraper(),
//     new RBCScraper(),
//     new CIBCScraper(),
//   ]
//
//   const mortgageScrapers = [
//     new RatehubScraper(),
//     new BigBankMortgageScraper(),
//   ]
//
//   const results = await Promise.allSettled([
//     ...scrapers.map(s => s.run()),
//     ...mortgageScrapers.map(s => s.run()),
//   ])
//
//   return NextResponse.json({
//     ran_at: new Date().toISOString(),
//     results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason }),
//   })
// }


// ============================================================
// app/api/track-click/route.ts
// POST /api/track-click — Log referral clicks (privacy-friendly)
// ============================================================

// export async function POST(req: NextRequest) {
//   const { card_id, offer_id, source_page } = await req.json()
//   const ip = req.headers.get('x-forwarded-for') ?? ''
//
//   // Hash IP for privacy
//   const encoder = new TextEncoder()
//   const data = encoder.encode(ip + process.env.IP_HASH_SALT)
//   const hashBuffer = await crypto.subtle.digest('SHA-256', data)
//   const ip_hash = Buffer.from(hashBuffer).toString('hex').slice(0, 16)
//
//   await supabaseAdmin.from('referral_clicks').insert({
//     card_id,
//     offer_id,
//     source_page,
//     ip_hash,
//     user_agent: req.headers.get('user-agent'),
//   })
//
//   return NextResponse.json({ success: true })
// }

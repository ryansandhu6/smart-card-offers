import { NextRequest, NextResponse } from 'next/server'
import { getActiveOffers } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limitedOnly = searchParams.get('limited') === 'true'
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))
  try {
    const offers = await getActiveOffers(limitedOnly, page, limit)
    return NextResponse.json({ offers, count: offers.length, page, limit })
  } catch (err) {
    console.error('/api/offers error:', err)
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
  }
}

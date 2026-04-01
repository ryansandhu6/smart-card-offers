// Public API — for external frontend use only
// app/api/issuers/route.ts
// GET /api/issuers — list all issuers that have at least one active card

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('issuers')
      .select('*, credit_cards!inner(id)')
      .eq('credit_cards.is_active', true)
      .order('name')

    if (error) throw error

    // Strip the credit_cards join array — it was only needed for the inner join filter
    const issuers = (data ?? []).map(({ credit_cards: _cards, ...issuer }) => issuer)

    return NextResponse.json({ issuers })
  } catch (err) {
    console.error('/api/issuers error:', err)
    return NextResponse.json({ error: 'Failed to fetch issuers' }, { status: 500 })
  }
}

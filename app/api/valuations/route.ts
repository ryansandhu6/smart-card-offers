// Public API — for external frontend use only
// app/api/valuations/route.ts
// GET /api/valuations — all points program valuations (cpp = cents per point)

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('points_valuations')
      .select('*')
      .order('program')

    if (error) throw error
    return NextResponse.json({ valuations: data, count: data.length })
  } catch (err) {
    console.error('/api/valuations error:', err)
    return NextResponse.json({ error: 'Failed to fetch valuations' }, { status: 500 })
  }
}

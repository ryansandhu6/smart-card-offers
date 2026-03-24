import { NextResponse } from 'next/server'
import { getMortgageRates } from '@/lib/supabase'

export async function GET() {
  try {
    const rates = await getMortgageRates()

    const grouped = rates?.reduce((acc, rate) => {
      const key = rate.rate_type as string
      if (!acc[key]) acc[key] = {} as Record<number, unknown[]>
      const termKey = rate.term_years as number
      if (!acc[key][termKey]) acc[key][termKey] = []
      acc[key][termKey].push(rate)
      return acc
    }, {} as Record<string, Record<number, unknown[]>>)

    return NextResponse.json({ rates, grouped })
  } catch (err) {
    console.error('/api/mortgage-rates error:', err)
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 })
  }
}

import { supabaseAdmin } from '@/lib/supabase'
import OffersTable from './OffersTable'

export const dynamic = 'force-dynamic'

export default async function OffersPage() {
  const [{ data: offers, error }, { data: cards }] = await Promise.all([
    supabaseAdmin
      .from('card_offers')
      .select(`
        id, card_id, headline, points_value, cashback_value, spend_requirement,
        spend_timeframe_days, start_month, is_monthly_bonus, monthly_points_value, monthly_spend_requirement, bonus_months,
        is_active, offer_type, source_priority, source_name,
        is_limited_time, expires_at,
        card:credit_cards ( name, slug )
      `)
      .order('is_active', { ascending: false })
      .order('source_priority', { ascending: true })
      .order('points_value', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('credit_cards')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name'),
  ])

  if (error) return <p className="text-red-600">Failed to load offers: {error.message}</p>

  type OfferRow = {
    id: string; card_id: string; headline: string; points_value: number | null
    cashback_value: number | null; spend_requirement: number | null
    spend_timeframe_days: number | null
    is_active: boolean; offer_type: string
    is_monthly_bonus: boolean; monthly_points_value: number | null
    monthly_spend_requirement: number | null; bonus_months: number | null
    start_month: number | null
    source_priority: number | null; source_name: string | null
    is_limited_time: boolean; expires_at: string | null
    card: { name: string; slug: string } | null
  }
  const rows = (offers ?? []).map(o => ({
    ...o,
    card: Array.isArray(o.card) ? (o.card[0] ?? null) : o.card,
  })) as OfferRow[]

  const active   = rows.filter(o => o.is_active).length
  const inactive = rows.length - active

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Offers</h1>
        <span className="text-sm text-gray-500">{active} active · {inactive} inactive</span>
      </div>
      <OffersTable offers={rows} cards={cards ?? []} />
    </div>
  )
}

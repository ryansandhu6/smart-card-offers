import { supabaseAdmin } from '@/lib/supabase'
import OffersTable from './OffersTable'

export const dynamic = 'force-dynamic'

export default async function OffersPage() {
  const [{ data: offers, error }, { data: cards }] = await Promise.all([
    supabaseAdmin
      .from('card_offers')
      .select(`
        id, headline, points_value, cashback_value, spend_requirement,
        is_active, offer_type, source_priority, source_name,
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
    id: string; headline: string; points_value: number | null
    cashback_value: number | null; spend_requirement: number | null
    is_active: boolean; offer_type: string
    source_priority: number | null; source_name: string | null
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

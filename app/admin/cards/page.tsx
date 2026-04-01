import { supabaseAdmin } from '@/lib/supabase'
import CardsTable from './CardsTable'

export const dynamic = 'force-dynamic'

export default async function CardsPage() {
  const [{ data: cards, error }, { data: issuers }, { data: fyfOffers }] = await Promise.all([
    supabaseAdmin
      .from('credit_cards')
      .select('id, name, slug, tier, is_active, rewards_type, short_description, referral_url, image_url, issuer:issuers(name)')
      .order('name'),
    supabaseAdmin
      .from('issuers')
      .select('id, name')
      .order('name'),
    supabaseAdmin
      .from('card_offers')
      .select('card_id')
      .eq('is_active', true)
      .contains('extra_perks', ['First year annual fee waived']),
  ])

  if (error) return <p className="text-red-600">Failed to load cards: {error.message}</p>

  const fyfCardIds = new Set((fyfOffers ?? []).map(o => o.card_id))

  type CardRow = {
    id: string; name: string; slug: string; tier: string
    is_active: boolean; rewards_type: string
    short_description: string | null; referral_url: string | null
    image_url: string | null; issuer: { name: string } | null
    has_fyf: boolean
  }
  const rows = (cards ?? []).map(c => ({
    ...c,
    issuer: Array.isArray(c.issuer) ? (c.issuer[0] ?? null) : c.issuer,
    has_fyf: fyfCardIds.has(c.id),
  })) as CardRow[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cards</h1>
        <span className="text-sm text-gray-500">{rows.length} total</span>
      </div>
      <CardsTable cards={rows} issuers={issuers ?? []} />
    </div>
  )
}

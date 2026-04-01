import { supabaseAdmin } from '@/lib/supabase'
import CardsTable from './CardsTable'

export const dynamic = 'force-dynamic'

export default async function CardsPage() {
  const { data: cards, error } = await supabaseAdmin
    .from('credit_cards')
    .select('id, name, slug, tier, is_active, rewards_type, short_description, referral_url, issuer:issuers(name)')
    .order('name')

  if (error) return <p className="text-red-600">Failed to load cards: {error.message}</p>

  // Supabase infers joined relations as arrays; cast to the shape CardsTable expects
  type CardRow = {
    id: string; name: string; slug: string; tier: string
    is_active: boolean; rewards_type: string
    short_description: string | null; referral_url: string | null
    issuer: { name: string } | null
  }
  const rows = (cards ?? []).map(c => ({
    ...c,
    issuer: Array.isArray(c.issuer) ? (c.issuer[0] ?? null) : c.issuer,
  })) as CardRow[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cards</h1>
        <span className="text-sm text-gray-500">{rows.length} total</span>
      </div>
      <CardsTable cards={rows} />
    </div>
  )
}

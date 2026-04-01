import { supabaseAdmin } from '@/lib/supabase'
import CardsTable from './CardsTable'

export const dynamic = 'force-dynamic'

export default async function CardsPage() {
  const [{ data: cards, error }, { data: issuers }] = await Promise.all([
    supabaseAdmin
      .from('credit_cards')
      .select('id, name, slug, tier, is_active, rewards_type, short_description, referral_url, image_url, annual_fee, annual_fee_waived_first_year, issuer:issuers(name)')
      .order('name'),
    supabaseAdmin
      .from('issuers')
      .select('id, name')
      .order('name'),
  ])

  if (error) return <p className="text-red-600">Failed to load cards: {error.message}</p>

  type CardRow = {
    id: string; name: string; slug: string; tier: string
    is_active: boolean; rewards_type: string
    annual_fee: number; annual_fee_waived_first_year: boolean
    short_description: string | null; referral_url: string | null
    image_url: string | null; issuer: { name: string } | null
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
      <CardsTable cards={rows} issuers={issuers ?? []} />
    </div>
  )
}

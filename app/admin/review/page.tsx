import { supabaseAdmin } from '@/lib/supabase'
import ReviewQueue from './ReviewQueue'

export const dynamic = 'force-dynamic'

export type OfferRow = {
  id: string
  card_id: string
  headline: string
  points_value: number | null
  cashback_value: number | null
  spend_requirement: number | null
  offer_type: string
  is_limited_time: boolean
  expires_at: string | null
  source_priority: number
  source_name: string | null
  review_status: string
  is_active: boolean
  scraped_at: string
}

export type CardGroup = {
  card_id: string
  card_name: string
  card_slug: string
  pending: OfferRow[]
  active: OfferRow[]
}

export default async function ReviewPage() {
  // Fetch all pending offers with card info
  const { data: pendingRaw, error: e1 } = await supabaseAdmin
    .from('card_offers')
    .select('id, card_id, headline, points_value, cashback_value, spend_requirement, offer_type, is_limited_time, expires_at, source_priority, source_name, review_status, is_active, scraped_at, credit_cards!inner(name, slug)')
    .eq('review_status', 'pending_review')
    .order('scraped_at', { ascending: false })

  if (e1) return <p className="text-red-600">Failed to load review queue: {e1.message}</p>

  const pendingCardIds = [...new Set((pendingRaw ?? []).map(o => o.card_id))]

  // Active offers for the same cards (multi-source comparison)
  const { data: activeRaw } = pendingCardIds.length
    ? await supabaseAdmin
        .from('card_offers')
        .select('id, card_id, headline, points_value, cashback_value, spend_requirement, offer_type, is_limited_time, expires_at, source_priority, source_name, review_status, is_active, scraped_at')
        .eq('is_active', true)
        .in('card_id', pendingCardIds)
    : { data: [] }

  // Build grouped structure
  const cardMeta = new Map<string, { name: string; slug: string }>()
  for (const o of pendingRaw ?? []) {
    const card = Array.isArray(o.credit_cards) ? o.credit_cards[0] : o.credit_cards as { name: string; slug: string } | null
    if (card && !cardMeta.has(o.card_id)) cardMeta.set(o.card_id, card)
  }

  const pendingByCard = new Map<string, OfferRow[]>()
  for (const o of pendingRaw ?? []) {
    const list = pendingByCard.get(o.card_id) ?? []
    list.push(o as OfferRow)
    pendingByCard.set(o.card_id, list)
  }

  const activeByCard = new Map<string, OfferRow[]>()
  for (const o of activeRaw ?? []) {
    const list = activeByCard.get(o.card_id) ?? []
    list.push(o as OfferRow)
    activeByCard.set(o.card_id, list)
  }

  const groups: CardGroup[] = pendingCardIds.map(id => ({
    card_id: id,
    card_name: cardMeta.get(id)?.name ?? id,
    card_slug: cardMeta.get(id)?.slug ?? '',
    pending: pendingByCard.get(id) ?? [],
    active: activeByCard.get(id) ?? [],
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Offer Review Queue</h1>
        <span className="text-sm text-gray-500">
          {(pendingRaw ?? []).length} offer{(pendingRaw ?? []).length !== 1 ? 's' : ''} pending across {groups.length} card{groups.length !== 1 ? 's' : ''}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-lg shadow px-6 py-12 text-center text-gray-400">
          No offers pending review. Run the scrapers to populate the queue.
        </div>
      ) : (
        <ReviewQueue groups={groups} />
      )}
    </div>
  )
}

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
  spend_timeframe_days: number | null
  offer_type: string
  is_limited_time: boolean
  expires_at: string | null
  source_priority: number
  source_name: string | null
  review_status: string
  is_active: boolean
  scraped_at: string
  is_monthly_bonus: boolean
  monthly_points_value: number | null
  monthly_spend_requirement: number | null
  monthly_cashback_value: number | null
  bonus_months: number | null
  start_month: number | null
}

export type ActiveCardOption = { id: string; name: string; slug: string }

export type CardGroup = {
  card_id: string
  card_name: string
  card_slug: string
  card_tier: string
  card_annual_fee: number | null
  card_annual_fee_waived: boolean
  card_description: string | null
  card_referral_url: string | null
  card_image_url: string | null
  card_is_active: boolean
  card_has_no_bonus: boolean
  card_foreign_transaction_fee: number | null
  card_min_income: number | null
  card_min_household_income: number | null
  pending: OfferRow[]
  active: OfferRow[]
}

export default async function ReviewPage() {
  // Fetch all pending offers with card info
  const { data: pendingRaw, error: e1 } = await supabaseAdmin
    .from('card_offers')
    .select('id, card_id, headline, points_value, cashback_value, spend_requirement, spend_timeframe_days, start_month, is_monthly_bonus, monthly_points_value, monthly_spend_requirement, monthly_cashback_value, bonus_months, offer_type, is_limited_time, expires_at, source_priority, source_name, review_status, is_active, scraped_at, credit_cards!inner(name, slug)')
    .eq('review_status', 'pending_review')
    .order('scraped_at', { ascending: false })

  if (e1) return <p className="text-red-600">Failed to load review queue: {e1.message}</p>

  const pendingCardIds = [...new Set((pendingRaw ?? []).map(o => o.card_id))]

  // Active offers + card details for the same cards
  type ActiveOfferRaw = { id: string; card_id: string; headline: string; points_value: number | null; cashback_value: number | null; spend_requirement: number | null; spend_timeframe_days: number | null; start_month: number | null; is_monthly_bonus: boolean; monthly_points_value: number | null; monthly_spend_requirement: number | null; monthly_cashback_value: number | null; bonus_months: number | null; offer_type: string; is_limited_time: boolean; expires_at: string | null; source_priority: number; source_name: string | null; review_status: string; is_active: boolean; scraped_at: string }
  type CardDetailRaw = { id: string; name: string; slug: string; tier: string; annual_fee: number | null; annual_fee_waived_first_year: boolean; short_description: string | null; referral_url: string | null; image_url: string | null; is_active: boolean; has_no_bonus: boolean; foreign_transaction_fee: number | null; min_income: number | null; minimum_household_income: number | null }

  const [{ data: activeRaw }, { data: cardDetails }, { data: allCardsRaw }] = await Promise.all([
    pendingCardIds.length
      ? supabaseAdmin
          .from('card_offers')
          .select('id, card_id, headline, points_value, cashback_value, spend_requirement, spend_timeframe_days, start_month, is_monthly_bonus, monthly_points_value, monthly_spend_requirement, monthly_cashback_value, bonus_months, offer_type, is_limited_time, expires_at, source_priority, source_name, review_status, is_active, scraped_at')
          .eq('is_active', true)
          .in('card_id', pendingCardIds)
      : Promise.resolve({ data: [] as ActiveOfferRaw[] }),
    pendingCardIds.length
      ? supabaseAdmin
          .from('credit_cards')
          .select('id, name, slug, tier, annual_fee, annual_fee_waived_first_year, short_description, referral_url, image_url, is_active, has_no_bonus, foreign_transaction_fee, min_income, minimum_household_income')
          .in('id', pendingCardIds)
      : Promise.resolve({ data: [] as CardDetailRaw[] }),
    supabaseAdmin.from('credit_cards').select('id, name, slug').eq('is_active', true).order('name'),
  ])

  // Build lookup maps
  const cardDetailMap = new Map<string, CardDetailRaw>()
  for (const c of (cardDetails ?? []) as CardDetailRaw[]) cardDetailMap.set(c.id, c)

  // Also capture name/slug from pending join (fallback if cardDetails missing)
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
  for (const o of (activeRaw ?? [])) {
    const list = activeByCard.get(o.card_id) ?? []
    list.push(o as OfferRow)
    activeByCard.set(o.card_id, list)
  }

  const groups: CardGroup[] = pendingCardIds.map(id => {
    const cd = cardDetailMap.get(id)
    return {
      card_id: id,
      card_name: cd?.name ?? cardMeta.get(id)?.name ?? id,
      card_slug: cd?.slug ?? cardMeta.get(id)?.slug ?? '',
      card_tier: cd?.tier ?? 'entry',
      card_annual_fee: cd?.annual_fee ?? null,
      card_annual_fee_waived: cd?.annual_fee_waived_first_year ?? false,
      card_description: cd?.short_description ?? null,
      card_referral_url: cd?.referral_url ?? null,
      card_image_url: cd?.image_url ?? null,
      card_is_active: cd?.is_active ?? true,
      card_has_no_bonus: cd?.has_no_bonus ?? false,
      card_foreign_transaction_fee: cd?.foreign_transaction_fee ?? null,
      card_min_income: cd?.min_income ?? null,
      card_min_household_income: cd?.minimum_household_income ?? null,
      pending: pendingByCard.get(id) ?? [],
      active: activeByCard.get(id) ?? [],
    }
  })

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
        <ReviewQueue groups={groups} allCards={(allCardsRaw ?? []) as ActiveCardOption[]} />
      )}
    </div>
  )
}

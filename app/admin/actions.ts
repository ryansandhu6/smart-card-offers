'use server'
import { supabaseAdmin } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

// ── Cards ────────────────────────────────────────────────────────────────────

export async function createCard(data: {
  name: string
  issuer_id: string
  card_network: string
  tier: string
  rewards_type: string
  referral_url: string | null
  image_url: string | null
}) {
  const base = data.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

  const { data: existing } = await supabaseAdmin
    .from('credit_cards')
    .select('id')
    .eq('slug', base)
    .maybeSingle()

  const slug = existing ? `${base}-2` : base

  const cardType = ['visa', 'mastercard', 'amex'].includes(data.card_network)
    ? data.card_network
    : 'visa'

  const { error } = await supabaseAdmin
    .from('credit_cards')
    .insert({
      name: data.name,
      slug,
      issuer_id: data.issuer_id,
      card_type: cardType,
      card_network: data.card_network,
      tier: data.tier,
      rewards_type: data.rewards_type,
      referral_url: data.referral_url,
      image_url: data.image_url,
      is_active: false,
      is_featured: false,
      annual_fee: 0,
      lounge_access: false,
      travel_insurance: false,
      purchase_protection: false,
    })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/cards')
}

export async function updateCard(
  id: string,
  data: {
    name: string
    tier: string
    is_active: boolean
    annual_fee: number
    annual_fee_waived_first_year: boolean
    short_description: string | null
    referral_url: string | null
    image_url: string | null
    foreign_transaction_fee?: number | null
    min_income?: number | null
    minimum_household_income?: number | null
    has_no_bonus?: boolean
    supplementary_card_fee?: number | null
    apply_url?: string | null
    purchase_rate?: number | null
    cash_advance_rate?: number | null
    credit_score_min?: string | null
    is_featured?: boolean
  }
) {
  // Tag as manual when description is explicitly set by an admin
  const payload: typeof data & { content_source?: string } = { ...data }
  if (data.short_description != null && data.short_description.trim() !== '') {
    payload.content_source = 'manual'
  }
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update(payload)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/cards')
  revalidatePath('/admin/review')
}

export async function setCardNoBonus(cardId: string, hasNoBonus: boolean) {
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update({ has_no_bonus: hasNoBonus })
    .eq('id', cardId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/review')
  revalidatePath('/admin')
}

export async function deactivateCard(id: string) {
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/cards')
}

export async function reactivateCard(id: string) {
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update({ is_active: true })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/cards')
}

export async function deleteCard(id: string) {
  // Delete child offers first to satisfy FK constraint
  const { error: offersError } = await supabaseAdmin
    .from('card_offers')
    .delete()
    .eq('card_id', id)
  if (offersError) throw new Error(offersError.message)

  const { error } = await supabaseAdmin
    .from('credit_cards')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  await cleanupOrphanedOffers()
  revalidatePath('/admin/cards')
  revalidatePath('/admin/review')
  revalidatePath('/admin/offers')
  revalidatePath('/admin')
}

export async function mergeCard(stubCardId: string, targetCardId: string) {
  // Find conflicts: offers that already exist on the target with same (offer_type, headline)
  const [{ data: stubOffers, error: e1 }, { data: targetOffers, error: e2 }] = await Promise.all([
    supabaseAdmin.from('card_offers').select('id, offer_type, headline').eq('card_id', stubCardId),
    supabaseAdmin.from('card_offers').select('offer_type, headline').eq('card_id', targetCardId),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)

  const targetKeys = new Set((targetOffers ?? []).map(o => `${o.offer_type}:${o.headline}`))
  const toMove = (stubOffers ?? []).filter(o => !targetKeys.has(`${o.offer_type}:${o.headline}`))
  const toDrop = (stubOffers ?? []).filter(o =>  targetKeys.has(`${o.offer_type}:${o.headline}`))

  if (toDrop.length > 0) {
    const { error } = await supabaseAdmin.from('card_offers').delete().in('id', toDrop.map(o => o.id))
    if (error) throw new Error(error.message)
  }
  if (toMove.length > 0) {
    const { error } = await supabaseAdmin.from('card_offers').update({ card_id: targetCardId }).in('id', toMove.map(o => o.id))
    if (error) throw new Error(error.message)
  }

  const { error: deleteErr } = await supabaseAdmin.from('credit_cards').delete().eq('id', stubCardId)
  if (deleteErr) throw new Error(deleteErr.message)

  revalidatePath('/admin/review')
  revalidatePath('/admin/cards')
  revalidatePath('/admin/offers')
  revalidatePath('/admin')
}

export async function cleanupOrphanedOffers(): Promise<{ deleted: number }> {
  const { data: validCards, error: fetchError } = await supabaseAdmin
    .from('credit_cards')
    .select('id')
  if (fetchError) throw new Error(fetchError.message)
  const validIds = (validCards ?? []).map((c: { id: string }) => c.id)
  if (validIds.length === 0) return { deleted: 0 }
  const { data: deleted, error } = await supabaseAdmin
    .from('card_offers')
    .delete()
    .not('card_id', 'in', `(${validIds.join(',')})`)
    .select('id')
  if (error) throw new Error(error.message)
  revalidatePath('/admin/offers')
  revalidatePath('/admin/review')
  revalidatePath('/admin')
  return { deleted: (deleted ?? []).length }
}

export async function deleteOffer(id: string) {
  const { error } = await supabaseAdmin
    .from('card_offers').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/offers')
  revalidatePath('/admin/review')
  revalidatePath('/admin')
}

// ── Offers ───────────────────────────────────────────────────────────────────

export async function createOffer(data: {
  card_id: string
  headline: string
  offer_type: string
  points_value: number | null
  cashback_value: number | null
  spend_requirement: number | null
  spend_timeframe_days?: number | null
  start_month?: number | null
  is_monthly_bonus?: boolean
  monthly_points_value?: number | null
  monthly_spend_requirement?: number | null
  monthly_cashback_value?: number | null
  bonus_months?: number | null
  source_name: string
  source_priority?: number
  is_limited_time: boolean
  expires_at: string | null
  is_active?: boolean
  review_status?: string
}) {
  const { is_active, review_status, source_priority = 0, ...rest } = data
  const { error } = await supabaseAdmin
    .from('card_offers')
    .insert({
      ...rest,
      source_priority,
      is_active: is_active ?? false,
      review_status: review_status ?? 'pending_review',
      scraped_at: new Date().toISOString(),
      is_verified: false,
      is_better_than_usual: false,
    })
  if (error) {
    console.error('[createOffer] supabase insert failed:', error, { data })
    throw new Error(error.message)
  }
  revalidatePath('/admin/offers')
  revalidatePath('/admin/review')
}

export async function updateOffer(
  id: string,
  data: {
    headline: string
    offer_type: string
    points_value: number | null
    cashback_value: number | null
    spend_requirement: number | null
    spend_timeframe_days?: number | null
    start_month?: number | null
    is_monthly_bonus?: boolean
    monthly_points_value?: number | null
    monthly_spend_requirement?: number | null
    monthly_cashback_value?: number | null
    bonus_months?: number | null
    is_active: boolean
    is_limited_time: boolean
    expires_at: string | null
  }
) {
  // Tag headline as manual when admin explicitly sets it
  const payload: typeof data & { content_source?: string } = { ...data }
  if (data.headline.trim()) payload.content_source = 'manual'
  const { error } = await supabaseAdmin
    .from('card_offers')
    .update(payload)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/offers')
}

export async function deactivateOffer(id: string) {
  const { error } = await supabaseAdmin
    .from('card_offers')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/offers')
}

// ── Review queue ──────────────────────────────────────────────────────────────

export async function sendCardToReview(cardId: string): Promise<{ success: boolean; error?: string }> {
  // Check if card has any offers at all
  const { data: existingOffers } = await supabaseAdmin
    .from('card_offers')
    .select('id')
    .eq('card_id', cardId)
    .limit(1)

  if (!existingOffers || existingOffers.length === 0) {
    // No offers exist — insert a blank placeholder so card appears in review queue
    const { error: insertError } = await supabaseAdmin
      .from('card_offers')
      .insert({
        card_id: cardId,
        headline: 'New offer — please fill in details',
        offer_type: 'welcome_bonus',
        points_value: null,
        cashback_value: null,
        spend_requirement: null,
        is_active: false,
        is_limited_time: false,
        review_status: 'pending_review',
        source_name: 'manual',
        source_priority: 0,
        is_verified: false,
        is_better_than_usual: false,
        scraped_at: new Date().toISOString(),
      })
    if (insertError) return { success: false, error: insertError.message }
  } else {
    // Mark ALL offers (active or not) as pending_review
    const { error } = await supabaseAdmin
      .from('card_offers')
      .update({ review_status: 'pending_review' })
      .eq('card_id', cardId)
    if (error) return { success: false, error: error.message }
  }

  revalidatePath('/admin/review')
  revalidatePath('/admin')
  return { success: true }
}

// ── Card data update review ───────────────────────────────────────────────────

export async function approveCardUpdate(cardId: string) {
  const { data: card, error: fetchErr } = await supabaseAdmin
    .from('credit_cards')
    .select('pending_card_data')
    .eq('id', cardId)
    .single()
  if (fetchErr) throw new Error(fetchErr.message)

  const pending = (card?.pending_card_data ?? {}) as Record<string, unknown>
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update({ ...pending, has_pending_update: false, pending_card_data: null })
    .eq('id', cardId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/review')
  revalidatePath('/admin')
}

export async function rejectCardUpdate(cardId: string) {
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update({ has_pending_update: false, pending_card_data: null })
    .eq('id', cardId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/review')
}

export async function approveOffer(id: string) {
  // Activate the offer — other active offers of the same type are left untouched
  const { error } = await supabaseAdmin
    .from('card_offers')
    .update({ is_active: true, review_status: 'approved' })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/review')
  revalidatePath('/admin')
}

export async function rejectOffer(id: string) {
  const { error } = await supabaseAdmin
    .from('card_offers')
    .update({ is_active: false, review_status: 'rejected' })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/review')
  revalidatePath('/admin')
}

export async function getCardActiveOffers(cardId: string): Promise<{
  id: string
  offer_type: string
  headline: string
  points_value: number | null
  cashback_value: number | null
}[]> {
  const { data, error } = await supabaseAdmin
    .from('card_offers')
    .select('id, offer_type, headline, points_value, cashback_value')
    .eq('card_id', cardId)
    .eq('is_active', true)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function mergeCardWithOfferSelection(
  stubId: string,
  targetId: string,
  keepOfferIds: string[]
) {
  // 1. Find stub offers and check for headline conflicts on target
  const [{ data: stubOffers, error: e1 }, { data: targetOffers, error: e2 }] = await Promise.all([
    supabaseAdmin.from('card_offers').select('id, offer_type, headline').eq('card_id', stubId),
    supabaseAdmin.from('card_offers').select('offer_type, headline').eq('card_id', targetId),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)

  const targetKeys = new Set((targetOffers ?? []).map(o => `${o.offer_type}:${o.headline}`))
  const toMove = (stubOffers ?? []).filter(o => !targetKeys.has(`${o.offer_type}:${o.headline}`))
  const toDrop = (stubOffers ?? []).filter(o =>  targetKeys.has(`${o.offer_type}:${o.headline}`))

  // 2. Drop stub offers whose headline already exists on target
  if (toDrop.length > 0) {
    const { error } = await supabaseAdmin.from('card_offers').delete().in('id', toDrop.map(o => o.id))
    if (error) throw new Error(error.message)
  }

  // 3. Move remaining stub offers to target card
  if (toMove.length > 0) {
    const { error } = await supabaseAdmin.from('card_offers').update({ card_id: targetId }).in('id', toMove.map(o => o.id))
    if (error) throw new Error(error.message)
  }

  // 4. Archive all currently active offers on target
  const { error: archiveError } = await supabaseAdmin
    .from('card_offers')
    .update({ is_active: false, review_status: 'archived' })
    .eq('card_id', targetId)
    .eq('is_active', true)
  if (archiveError) throw new Error(archiveError.message)

  // 5. Activate only the admin-selected offers
  if (keepOfferIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('card_offers')
      .update({ is_active: true, review_status: 'approved' })
      .in('id', keepOfferIds)
    if (error) throw new Error(error.message)
  }

  // 6. Delete stub card
  const { error: deleteErr } = await supabaseAdmin.from('credit_cards').delete().eq('id', stubId)
  if (deleteErr) throw new Error(deleteErr.message)

  revalidatePath('/admin/review')
  revalidatePath('/admin/cards')
  revalidatePath('/admin/offers')
  revalidatePath('/admin')
}

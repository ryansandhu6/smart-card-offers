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
      is_active: true,
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
  }
) {
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update(data)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/cards')
  revalidatePath('/admin/review')
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
  revalidatePath('/admin/cards')
  revalidatePath('/admin/review')
  revalidatePath('/admin/offers')
  revalidatePath('/admin')
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
  source_name: string
  source_priority: number
  is_limited_time: boolean
  expires_at: string | null
  is_active?: boolean
  review_status?: string
}) {
  const { is_active, review_status, ...rest } = data
  const { error } = await supabaseAdmin
    .from('card_offers')
    .insert({
      ...rest,
      is_active: is_active ?? true,
      review_status: review_status ?? 'approved',
      scraped_at: new Date().toISOString(),
      is_verified: false,
      is_better_than_usual: false,
    })
  if (error) throw new Error(error.message)
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
    is_active: boolean
    is_limited_time: boolean
    expires_at: string | null
  }
) {
  const { error } = await supabaseAdmin
    .from('card_offers')
    .update(data)
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
        source_priority: 9,
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

export async function approveOffer(id: string) {
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

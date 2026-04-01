'use server'
import { supabaseAdmin } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

// ── Cards ────────────────────────────────────────────────────────────────────

export async function updateCard(
  id: string,
  data: {
    name: string
    tier: string
    is_active: boolean
    short_description: string | null
    referral_url: string | null
  }
) {
  const { error } = await supabaseAdmin
    .from('credit_cards')
    .update(data)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/cards')
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
}

// ── Offers ───────────────────────────────────────────────────────────────────

export async function updateOffer(
  id: string,
  data: {
    headline: string
    points_value: number | null
    cashback_value: number | null
    is_active: boolean
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

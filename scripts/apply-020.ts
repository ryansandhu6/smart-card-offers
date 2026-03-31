// scripts/apply-020.ts
// Applies migration 020: deactivate p3/p4 offers, merge duplicate groups.
// Usage: npx tsx --env-file=.env.local scripts/apply-020.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── types ───────────────────────────────────────────────────────────────────

interface Offer {
  id: string
  card_id: string
  offer_type: string
  source_priority: number
  headline: string
  details: string | null
  points_value: number | null
  cashback_value: number | null
  spend_requirement: number | null
  spend_timeframe_days: number | null
  source_url: string | null
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[020] Starting migration...\n')

  // ══════════════════════════════════════════════════════════════════════
  // STEP 1 — Deactivate all p3/p4 offers
  // ══════════════════════════════════════════════════════════════════════

  // Count first so we can log how many were deactivated
  const { data: toDeactivate, error: countErr } = await supabase
    .from('card_offers')
    .select('id')
    .eq('is_active', true)
    .in('source_priority', [3, 4])
  if (countErr) throw new Error(`Step 1 count failed: ${countErr.message}`)

  const deactivateCount = toDeactivate?.length ?? 0

  if (deactivateCount > 0) {
    const ids = toDeactivate!.map(r => r.id)
    const { error: deactivateErr } = await supabase
      .from('card_offers')
      .update({ is_active: false })
      .in('id', ids)
    if (deactivateErr) throw new Error(`Step 1 update failed: ${deactivateErr.message}`)
  }

  console.log(`[020] Step 1: deactivated ${deactivateCount} p3/p4 offer(s)`)

  // ══════════════════════════════════════════════════════════════════════
  // STEP 2 — Merge duplicate (card_id, offer_type, source_priority) groups
  // ══════════════════════════════════════════════════════════════════════

  const { data: active, error: fetchErr } = await supabase
    .from('card_offers')
    .select('id, card_id, offer_type, source_priority, headline, details, points_value, cashback_value, spend_requirement, spend_timeframe_days, source_url')
    .eq('is_active', true)
  if (fetchErr) throw new Error(`Step 2 fetch failed: ${fetchErr.message}`)

  // Group by (card_id, offer_type, source_priority)
  const groups = new Map<string, Offer[]>()
  for (const offer of (active as Offer[])) {
    const key = `${offer.card_id}|${offer.offer_type}|${offer.source_priority}`
    const g = groups.get(key) ?? []
    g.push(offer)
    groups.set(key, g)
  }

  const duplicates = [...groups.entries()].filter(([, g]) => g.length > 1)
  console.log(`[020] Step 2: found ${duplicates.length} duplicate group(s)`)

  let mergeCount = 0

  for (const [key, offers] of duplicates) {
    const [card_id, offer_type, srcPriorityStr] = key.split('|')
    const source_priority = Number(srcPriorityStr)

    // Sort highest-value first for consistent headline/details ordering
    offers.sort(
      (a, b) =>
        ((b.points_value ?? 0) + (b.cashback_value ?? 0)) -
        ((a.points_value ?? 0) + (a.cashback_value ?? 0))
    )

    const total_pts  = offers.reduce((s, o) => s + (o.points_value  ?? 0), 0)
    const total_cash = offers.reduce((s, o) => s + (o.cashback_value ?? 0), 0)

    const merged_headline =
      'Up to ' + (
        total_pts > 0
          ? `${total_pts.toLocaleString()} points (merged)`
          : `${total_cash} cashback (merged)`
      )

    const merged_details = offers
      .map(o => (o.details?.trim() || o.headline).trim())
      .join(' ')
      .trim() || null

    const max_spend = Math.max(...offers.map(o => o.spend_requirement ?? 0)) || null
    const max_days  = Math.max(...offers.map(o => o.spend_timeframe_days ?? 0)) || null
    const src_url   = offers.find(o => o.source_url)?.source_url ?? null
    const now       = new Date().toISOString()

    // Deactivate parts
    const partIds = offers.map(o => o.id)
    const { error: deactErr } = await supabase
      .from('card_offers')
      .update({ is_active: false })
      .in('id', partIds)
    if (deactErr) throw new Error(`Step 2 deactivate parts failed: ${deactErr.message}`)

    // Insert merged row (upsert on natural key)
    const { error: insertErr } = await supabase
      .from('card_offers')
      .upsert(
        {
          card_id,
          offer_type,
          headline: merged_headline,
          details: merged_details,
          points_value:          total_pts  || null,
          cashback_value:        total_cash || null,
          spend_requirement:     max_spend,
          spend_timeframe_days:  max_days,
          source_priority,
          source_url:            src_url,
          is_active:             true,
          scraped_at:            now,
          last_seen_at:          now,
        },
        { onConflict: 'card_id,offer_type,headline' }
      )
    if (insertErr) throw new Error(`Step 2 insert merged row failed: ${insertErr.message}`)

    mergeCount++
    console.log(
      `[020] Step 2 [${mergeCount}]: merged ${offers.length} parts` +
      ` — card=${card_id} type=${offer_type} p${source_priority}` +
      `  pts=${total_pts} cash=${total_cash}`
    )
  }

  console.log(`[020] Step 2: merged ${mergeCount} group(s) total\n`)

  // ══════════════════════════════════════════════════════════════════════
  // VERIFY
  // ══════════════════════════════════════════════════════════════════════

  const { count: p34Count } = await supabase
    .from('card_offers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .in('source_priority', [3, 4])

  // Multi-offer groups: fetch all active again and recount
  const { data: activePost } = await supabase
    .from('card_offers')
    .select('card_id, offer_type, source_priority')
    .eq('is_active', true)

  const postGroups = new Map<string, number>()
  for (const r of (activePost ?? [])) {
    const k = `${r.card_id}|${r.offer_type}|${r.source_priority}`
    postGroups.set(k, (postGroups.get(k) ?? 0) + 1)
  }
  const multiGroupsRemaining = [...postGroups.values()].filter(n => n > 1).length

  const { count: totalActive } = await supabase
    .from('card_offers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  console.log(`[020] Verify — active p3/p4 remaining : ${p34Count}  (expect 0)`)
  console.log(`[020] Verify — multi-offer groups     : ${multiGroupsRemaining}  (expect 0)`)
  console.log(`[020] Verify — total active offers    : ${totalActive}`)
}

main().catch(err => {
  console.error('[020] Fatal:', err.message)
  process.exit(1)
})

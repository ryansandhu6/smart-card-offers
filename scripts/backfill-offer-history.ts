// scripts/backfill-offer-history.ts
// One-off: inserts one offer_history row for every active card_offer that doesn't
// already have a history entry. Safe to run multiple times — skips existing rows.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/backfill-offer-history.ts

import { supabaseAdmin } from '../lib/supabase'

async function main() {
  // Fetch all active offers
  const { data: offers, error: offersError } = await supabaseAdmin
    .from('card_offers')
    .select('id, card_id, offer_type, headline, points_value, cashback_value, spend_requirement, spend_timeframe_days, source_priority, scraped_at')
    .eq('is_active', true)

  if (offersError) { console.error('Failed to fetch card_offers:', offersError.message); process.exit(1) }
  if (!offers?.length) { console.log('No active offers found.'); return }

  console.log(`Found ${offers.length} active offers. Checking for existing history rows...\n`)

  // Fetch all existing offer_history rows (just the natural key columns)
  const { data: existing, error: historyError } = await supabaseAdmin
    .from('offer_history')
    .select('card_id, offer_type, headline')

  if (historyError) { console.error('Failed to fetch offer_history:', historyError.message); process.exit(1) }

  // Build a Set of keys already in history for O(1) lookup
  const seen = new Set((existing ?? []).map(r => `${r.card_id}|${r.offer_type}|${r.headline}`))

  const toInsert = offers.filter(o => !seen.has(`${o.card_id}|${o.offer_type}|${o.headline}`))

  if (!toInsert.length) {
    console.log('All offers already have history rows — nothing to backfill.')
    return
  }

  console.log(`Inserting ${toInsert.length} history rows (${offers.length - toInsert.length} already exist)...\n`)

  const now = new Date().toISOString()
  let inserted = 0
  let failed = 0

  for (const offer of toInsert) {
    const first_seen_at = offer.scraped_at ?? now

    const { error } = await supabaseAdmin.from('offer_history').insert({
      card_id:              offer.card_id,
      offer_type:           offer.offer_type,
      headline:             offer.headline,
      points_value:         offer.points_value         ?? null,
      cashback_value:       offer.cashback_value       ?? null,
      spend_requirement:    offer.spend_requirement    ?? null,
      spend_timeframe_days: offer.spend_timeframe_days ?? null,
      source_priority:      offer.source_priority      ?? null,
      first_seen_at,
      last_seen_at:         now,
    })

    if (error) {
      console.error(`  FAILED [${offer.headline.slice(0, 60)}]: ${error.message}`)
      failed++
    } else {
      console.log(`  OK  ${offer.offer_type.padEnd(15)} ${offer.headline.slice(0, 60)}`)
      inserted++
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${failed} failed.`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

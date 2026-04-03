// scripts/send-all-to-review.ts
// Sends all active cards into the review queue.
// Run: npx tsx --env-file=.env.local scripts/send-all-to-review.ts

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  // 1. Fetch all active cards
  const { data: cards, error: cardsErr } = await supabase
    .from('credit_cards')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (cardsErr || !cards) {
    console.error('Failed to fetch cards:', cardsErr?.message)
    process.exit(1)
  }

  console.log(`Found ${cards.length} active cards\n`)

  let updated    = 0
  let inserted   = 0
  let errors     = 0

  for (const card of cards) {
    // 2. Check if card has any offers
    const { data: offers, error: offersErr } = await supabase
      .from('card_offers')
      .select('id')
      .eq('card_id', card.id)
      .limit(1)

    if (offersErr) {
      console.error(`  [ERROR] ${card.name}: ${offersErr.message}`)
      errors++
      continue
    }

    if (offers && offers.length > 0) {
      // 3. Has offers → mark all as pending_review
      const { error: updateErr } = await supabase
        .from('card_offers')
        .update({ review_status: 'pending_review' })
        .eq('card_id', card.id)

      if (updateErr) {
        console.error(`  [ERROR] ${card.name}: ${updateErr.message}`)
        errors++
      } else {
        console.log(`  [updated]  ${card.name}`)
        updated++
      }
    } else {
      // 4. No offers → insert placeholder
      const { error: insertErr } = await supabase
        .from('card_offers')
        .insert({
          card_id:              card.id,
          headline:             'New offer — please fill in details',
          offer_type:           'welcome_bonus',
          points_value:         null,
          cashback_value:       null,
          spend_requirement:    null,
          is_active:            false,
          is_limited_time:      false,
          review_status:        'pending_review',
          source_name:          'manual',
          source_priority:      9,
          is_verified:          false,
          is_better_than_usual: false,
          scraped_at:           new Date().toISOString(),
        })

      if (insertErr) {
        console.error(`  [ERROR] ${card.name}: ${insertErr.message}`)
        errors++
      } else {
        console.log(`  [placeholder] ${card.name}`)
        inserted++
      }
    }
  }

  console.log('\n─────────────────────────────────')
  console.log(`  Cards updated:          ${updated}`)
  console.log(`  Placeholders inserted:  ${inserted}`)
  console.log(`  Errors:                 ${errors}`)
  console.log('─────────────────────────────────')
}

main()

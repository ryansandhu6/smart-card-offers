// scripts/verify-and-rescrape.ts
// 1. Verifies the card_offers unique constraint exists (by doing a controlled upsert test)
// 2. If constraint is missing, prints the migration SQL and exits
// 3. If constraint exists, re-runs the MintFlying scraper and prints the result
//
// Run: DOTENV_CONFIG_PATH=.env.local npx ts-node -r dotenv/config scripts/verify-and-rescrape.ts

import { supabaseAdmin } from '../lib/supabase'
import { MintFlyingScraper } from '../scrapers/aggregators'

const MIGRATION_SQL = `
-- Run this in Supabase Dashboard → SQL Editor:

ALTER TABLE card_offers
  ADD CONSTRAINT card_offers_card_offer_headline_key
  UNIQUE (card_id, offer_type, headline);
`

async function checkConstraint(): Promise<boolean> {
  // Get any real card id to use as a probe
  const { data: card } = await supabaseAdmin
    .from('credit_cards')
    .select('id')
    .limit(1)
    .single()

  if (!card) {
    console.error('No cards in credit_cards — seed first.')
    process.exit(1)
  }

  // Insert a test offer row
  const testPayload = {
    card_id: card.id,
    offer_type: 'referral',
    headline: '__constraint_test__',
    is_limited_time: false,
    is_active: false,
    scraped_at: new Date().toISOString(),
  }

  const { error: ins1 } = await supabaseAdmin.from('card_offers').insert(testPayload)
  if (ins1) {
    // If insert itself fails for an unexpected reason, bail
    if (!ins1.message.includes('duplicate') && !ins1.message.includes('unique')) {
      console.error('Unexpected insert error:', ins1.message)
      process.exit(1)
    }
    // Already exists from a previous test run — that's fine, the constraint is there
    return true
  }

  // Now upsert the same row — if the unique constraint exists, this will DO UPDATE
  // If it doesn't exist, it will INSERT a second row (no conflict path)
  const { error: ups } = await supabaseAdmin
    .from('card_offers')
    .upsert(testPayload, { onConflict: 'card_id,offer_type,headline' })

  // Clean up the test row(s)
  await supabaseAdmin
    .from('card_offers')
    .delete()
    .eq('card_id', card.id)
    .eq('offer_type', 'referral')
    .eq('headline', '__constraint_test__')

  if (ups) {
    // upsert failed — constraint likely missing (PostgREST returns 42P10 for missing constraint)
    console.error('Upsert test failed:', ups.message)
    return false
  }

  return true
}

async function main() {
  console.log('=== verify-and-rescrape ===\n')

  console.log('Checking card_offers unique constraint...')
  const ok = await checkConstraint()

  if (!ok) {
    console.log('\n⚠️  Unique constraint is MISSING on card_offers.')
    console.log('Run this SQL in Supabase Dashboard → SQL Editor, then re-run this script:\n')
    console.log(MIGRATION_SQL)
    process.exit(1)
  }

  console.log('✅ Unique constraint confirmed.\n')

  // Confirm card count
  const { count: cardCount } = await supabaseAdmin
    .from('credit_cards')
    .select('*', { count: 'exact', head: true })
  console.log(`credit_cards: ${cardCount} rows`)

  const { count: offersBefore } = await supabaseAdmin
    .from('card_offers')
    .select('*', { count: 'exact', head: true })
  console.log(`card_offers before scrape: ${offersBefore} rows\n`)

  // Re-run MintFlying scraper
  console.log('Running MintFlying scraper...\n')
  const result = await new MintFlyingScraper().run()

  console.log('\nResult:', result)

  const { count: offersAfter } = await supabaseAdmin
    .from('card_offers')
    .select('*', { count: 'exact', head: true })
  console.log(`\ncard_offers after scrape: ${offersAfter} rows`)

  if ((offersAfter ?? 0) > 0) {
    console.log('\n✅ Offers are saving correctly!')

    // Show a sample
    const { data: sample } = await supabaseAdmin
      .from('card_offers')
      .select('headline, offer_type, points_value, card_id')
      .limit(5)
    console.log('\nSample offers:')
    sample?.forEach(o => console.log(`  [${o.offer_type}] ${o.headline?.slice(0, 70)}`))
  } else {
    console.log('\n⚠️  Still 0 offers — check the scraper errors above.')
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

// scripts/cleanup-placeholder-cards.ts
// Deletes credit_cards rows that were created as placeholders by the broken scraper
// (ensureCard was being called for every offer due to the invalid issuer-subquery bug).
//
// Safe: only deletes cards whose slug is NOT in our known seeded list.
// Run: DOTENV_CONFIG_PATH=.env.local npx ts-node -r dotenv/config scripts/cleanup-placeholder-cards.ts

import { supabaseAdmin } from '../lib/supabase'

// All slugs we intentionally seeded — these are kept
const SEEDED_SLUGS = new Set([
  'amex-cobalt',
  'amex-platinum',
  'amex-gold-rewards',
  'amex-simplycash-preferred',
  'td-aeroplan-visa-infinite',
  'td-first-class-travel',
  'scotiabank-passport-visa-infinite',
  'scotiabank-momentum-visa-infinite',
  'bmo-eclipse-visa-infinite',
  'rbc-avion-visa-infinite',
  'westjet-rbc-world-elite',
  'cibc-aeroplan-visa-infinite',
  'cibc-dividend-visa-infinite',
  'tangerine-money-back',
  // MBNA + Rogers (may or may not be seeded yet)
  'mbna-rewards-mastercard',
  'mbna-trueline-mastercard',
  'mbna-alaska-airlines-mastercard',
  'rogers-red-world-elite',
  'rogers-red-mastercard',
])

async function main() {
  console.log('Fetching all credit_cards...')
  const { data: allCards, error } = await supabaseAdmin
    .from('credit_cards')
    .select('id, slug, name')

  if (error) {
    console.error('Failed to fetch cards:', error.message)
    process.exit(1)
  }

  const toDelete = (allCards ?? []).filter(c => !SEEDED_SLUGS.has(c.slug))
  const toKeep = (allCards ?? []).filter(c => SEEDED_SLUGS.has(c.slug))

  console.log(`Total cards: ${allCards?.length}`)
  console.log(`Keeping (seeded): ${toKeep.length}`)
  console.log(`Deleting (placeholders): ${toDelete.length}\n`)

  if (toDelete.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  console.log('Placeholder cards to be deleted:')
  toDelete.forEach(c => console.log(`  ${c.slug}`))
  console.log()

  const ids = toDelete.map(c => c.id)
  const { error: delErr } = await supabaseAdmin
    .from('credit_cards')
    .delete()
    .in('id', ids)

  if (delErr) {
    console.error('Delete failed:', delErr.message)
    process.exit(1)
  }

  console.log(`✅ Deleted ${toDelete.length} placeholder cards.`)

  // Verify
  const { count } = await supabaseAdmin
    .from('credit_cards')
    .select('*', { count: 'exact', head: true })
  console.log(`credit_cards now has ${count} rows.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

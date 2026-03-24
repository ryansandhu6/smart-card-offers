// scripts/diagnose-offers.ts
// Diagnose why card_offers shows 0 rows in the Supabase dashboard.
// Run: DOTENV_CONFIG_PATH=.env.local npx ts-node -r dotenv/config scripts/diagnose-offers.ts

import { supabaseAdmin } from '../lib/supabase'

async function main() {
  console.log('=== card_offers diagnostics ===\n')

  // 1. Raw count via service role (bypasses RLS)
  const { count: offerCount, error: countErr } = await supabaseAdmin
    .from('card_offers')
    .select('*', { count: 'exact', head: true })

  if (countErr) {
    console.error('Count query failed:', countErr.message)
  } else {
    console.log(`1. Total rows in card_offers (service role): ${offerCount}`)
  }

  // 2. Fetch a few sample rows to confirm data shape
  const { data: sample, error: sampleErr } = await supabaseAdmin
    .from('card_offers')
    .select('id, card_id, offer_type, headline, is_active, scraped_at')
    .limit(5)

  if (sampleErr) {
    console.error('Sample fetch failed:', sampleErr.message)
  } else if (!sample?.length) {
    console.log('2. Sample rows: NONE — table is genuinely empty\n')
  } else {
    console.log('\n2. Sample rows:')
    sample.forEach(r => console.log(`   card_id=${r.card_id} | type=${r.offer_type} | active=${r.is_active} | headline="${r.headline?.slice(0, 60)}"`))
  }

  // 3. Check for orphaned offers (card_id not in credit_cards)
  const { data: orphans, error: orphanErr } = await supabaseAdmin
    .from('card_offers')
    .select('card_id')

  if (orphanErr) {
    console.error('\n3. Orphan check failed:', orphanErr.message)
  } else if (orphans && orphans.length > 0) {
    const cardIds = [...new Set(orphans.map(o => o.card_id))]
    const { data: cards } = await supabaseAdmin
      .from('credit_cards')
      .select('id')
      .in('id', cardIds)

    const foundIds = new Set((cards ?? []).map(c => c.id))
    const missingIds = cardIds.filter(id => !foundIds.has(id))

    console.log(`\n3. Distinct card_ids referenced in offers: ${cardIds.length}`)
    console.log(`   Matched in credit_cards: ${foundIds.size}`)
    if (missingIds.length) {
      console.log(`   ⚠️  ORPHANED card_ids (no matching credit_cards row): ${missingIds.length}`)
      missingIds.slice(0, 5).forEach(id => console.log(`      ${id}`))
    } else {
      console.log('   All card_ids have matching credit_cards rows ✅')
    }
  } else {
    console.log('\n3. No offers found to check for orphans.')
  }

  // 4. Check scrape_logs
  const { data: logs, error: logErr } = await supabaseAdmin
    .from('scrape_logs')
    .select('scraper_name, status, records_found, records_updated, error_message, ran_at')
    .order('ran_at', { ascending: false })
    .limit(10)

  console.log('\n4. Recent scrape_logs:')
  if (logErr) {
    console.error('   scrape_logs query failed:', logErr.message)
  } else if (!logs?.length) {
    console.log('   No scrape_logs rows found')
  } else {
    logs.forEach(l =>
      console.log(`   [${l.ran_at?.slice(0, 19)}] ${l.scraper_name} → ${l.status} | found=${l.records_found} updated=${l.records_updated}${l.error_message ? ' ERR: ' + l.error_message : ''}`)
    )
  }

  // 5. Check RLS policies via pg_policies (only works if granted access)
  console.log('\n5. Checking active RLS on card_offers...')
  const { data: rlsCheck, error: rlsErr } = await supabaseAdmin
    .from('card_offers')
    .select('id', { count: 'exact', head: true })

  // If count is 0 but table has rows, RLS is blocking reads
  // The service role should bypass RLS by default in Supabase
  // But if card_offers has RLS enabled WITHOUT a service_role policy, even the admin client could be blocked
  // depending on the client configuration

  // Check if count differs between anon and admin
  const { createClient } = await import('@supabase/supabase-js')
  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { count: anonCount, error: anonErr } = await supabaseAnon
    .from('card_offers')
    .select('*', { count: 'exact', head: true })

  console.log(`   service_role count: ${offerCount ?? 'error'}`)
  console.log(`   anon key count:     ${anonErr ? `error (${anonErr.message})` : anonCount}`)

  if ((offerCount ?? 0) > 0 && (anonCount ?? 0) === 0) {
    console.log('\n   ⚠️  RLS is blocking anon reads on card_offers — no public SELECT policy exists')
    console.log('   → Run the fix below in Supabase SQL Editor:\n')
    console.log('   CREATE POLICY "Public read offers" ON card_offers FOR SELECT USING (is_active = true);\n')
    console.log('   (The schema.sql has this but it may not have been applied yet)')
  } else if ((offerCount ?? 0) === 0) {
    console.log('\n   ⚠️  card_offers table is EMPTY — the scraper did not actually persist rows')
  } else {
    console.log('\n   Both service_role and anon can read offers ✅')
  }

  console.log('\n=== Done ===')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

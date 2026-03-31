// scripts/parse-spend-requirements.ts
// Backfill: parse spend_requirement from offer headlines where it is NULL.
// Usage: npx tsx --env-file=.env.local scripts/parse-spend-requirements.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ---------------------------------------------------------------------------
// Spend-amount parser
//
// Matches dollar amounts that appear in an explicit spending context.
// Ordered from most specific to least — first match wins.
//
// Patterns covered:
//   "$3,500 spent"  "$3,500 spend"   →  "on first $3,500 spent in 90 days"
//   "spend $50"     "spending $X"    →  "when you spend $50 or more"
//   "after $X"      "after spending" →  "after $1,500 in purchases"
//   "on $X"  / "on first $X"         →  "10% on $3,500 (first year free)"
//     └ NOT matched: "on $250 cash back" (negative lookahead for "cash")
//
// NOT matched (intentionally):
//   "Up to $250 cash back"   — value, not spend
//   "earn $X"                — value
//   "up to $400"             — cap, not spend
// ---------------------------------------------------------------------------

const SPEND_PATTERNS: RegExp[] = [
  /\$\s*([\d,]+)\s+spent?\b/i,                                 // "$3,500 spent" / "$X spend"
  /\bspend(?:ing)?\s+\$\s*([\d,]+)/i,                         // "spend $50" / "spending $1,000"
  /\bafter\s+(?:spending\s+)?\$\s*([\d,]+)/i,                 // "after $1,500" / "after spending $X"
  /\bon\s+(?:(?:first|every)\s+)?\$\s*([\d,]+)(?!\s*cash)/i,  // "on $3,500" / "on first $X" (not "on $X cash back")
]

function parseSpend(headline: string): number | null {
  for (const re of SPEND_PATTERNS) {
    const m = headline.match(re)
    if (m) {
      const amount = parseInt(m[1].replace(/,/g, ''), 10)
      if (!isNaN(amount) && amount > 0) return amount
    }
  }
  return null
}

// ---------------------------------------------------------------------------

async function main() {
  const { data: offers, error } = await supabase
    .from('card_offers')
    .select('id, headline')
    .eq('is_active', true)
    .is('spend_requirement', null)
    .not('headline', 'is', null)

  if (error) throw new Error(`Fetch failed: ${error.message}`)
  console.log(`Fetched ${offers?.length ?? 0} active offers with null spend_requirement\n`)

  let filled = 0
  let skipped = 0

  for (const offer of offers ?? []) {
    const amount = parseSpend(offer.headline)

    if (amount === null) {
      skipped++
      continue
    }

    const { error: updateErr } = await supabase
      .from('card_offers')
      .update({ spend_requirement: amount })
      .eq('id', offer.id)

    if (updateErr) {
      console.error(`  FAIL  id=${offer.id}: ${updateErr.message}`)
      continue
    }

    console.log(`  FILL  spend=${amount.toLocaleString().padStart(7)}  "${offer.headline}"`)
    filled++
  }

  console.log(`\n─────────────────────────────────────────`)
  console.log(`Filled : ${filled}`)
  console.log(`No match (spend_requirement stays NULL): ${skipped}`)

  // Verify
  const { count } = await supabase
    .from('card_offers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('spend_requirement', null)

  console.log(`\nSELECT COUNT(*) FROM card_offers WHERE is_active = true AND spend_requirement IS NULL;`)
  console.log(`  count: ${count}`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})

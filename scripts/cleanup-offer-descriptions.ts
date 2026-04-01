// scripts/cleanup-offer-descriptions.ts
// Backfills the `details` field on active card_offers where it is null,
// empty, or contains the literal string "undefined".
//
// Generated description format:
//   "Welcome bonus on the {Card Name}: {headline, sentence-cased}.
//    Earn {X} points / {X}% cash back."
//
// Run:  npx tsx --env-file=.env.local scripts/cleanup-offer-descriptions.ts

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function sentenceCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function buildDescription(
  headline: string,
  cardName: string,
  pointsValue: number | null,
  cashbackValue: number | null,
): string {
  const parts: string[] = []

  // Opening: card name context
  parts.push(`Welcome bonus on the ${cardName}`)

  // Headline as the primary sentence
  const hl = sentenceCase(headline.replace(/\.$/, ''))
  parts.push(hl)

  // Value summary if not already obvious from headline
  if (pointsValue && pointsValue > 0 && !headline.match(/[\d,]+\s*(points?|miles?|MR|Scene\+)/i)) {
    parts.push(`Earn ${pointsValue.toLocaleString('en-CA')} points`)
  } else if (cashbackValue && cashbackValue > 0 && !/\d+%/.test(headline) && !/cash.?back/i.test(headline)) {
    parts.push(`Earn ${cashbackValue}% cash back`)
  }

  return parts.join('. ').replace(/\.\./g, '.') + '.'
}

async function main() {
  // Fetch active offers where details is null, empty string, or contains "undefined"
  const { data: offers, error } = await sb
    .from('card_offers')
    .select(`
      id, headline, points_value, cashback_value, details,
      credit_cards!inner(name)
    `)
    .eq('is_active', true)
    .or('details.is.null,details.eq.,details.ilike.%undefined%')

  if (error) {
    console.error('Fetch error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${offers?.length ?? 0} offers needing descriptions\n`)

  let updated = 0
  let failed = 0

  for (const offer of offers ?? []) {
    const card = Array.isArray(offer.credit_cards)
      ? offer.credit_cards[0]
      : offer.credit_cards as { name: string } | null

    if (!card?.name || !offer.headline) {
      console.log(`  SKIP [no card/headline] id=${offer.id}`)
      continue
    }

    const description = buildDescription(
      offer.headline,
      card.name,
      offer.points_value,
      offer.cashback_value,
    )

    const { error: updateError } = await sb
      .from('card_offers')
      .update({ details: description })
      .eq('id', offer.id)

    if (updateError) {
      console.error(`  FAIL id=${offer.id}: ${updateError.message}`)
      failed++
    } else {
      console.log(`  OK  "${card.name}" — ${description.slice(0, 80)}…`)
      updated++
    }
  }

  // Final count
  const { count: nullRemaining } = await sb
    .from('card_offers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('details', null)

  console.log(`\n────────────────────────────────────`)
  console.log(`Updated: ${updated}  Failed: ${failed}`)
  console.log(`Offers still with null details: ${nullRemaining}`)
}

main()

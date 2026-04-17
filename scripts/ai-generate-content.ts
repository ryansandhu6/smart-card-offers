/**
 * scripts/ai-generate-content.ts
 *
 * Uses Claude to generate:
 *   • credit_cards.short_description  — 1-2 factual sentences per card
 *   • card_offers.headline            — descriptive offer headline
 *
 * Skips anything marked content_source = 'manual' (human-written, never overwrite).
 * Re-runs are safe: only targets NULL / ai_generated / placeholder content.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ai-generate-content.ts           # dry-run
 *   npx tsx --env-file=.env.local scripts/ai-generate-content.ts --commit  # write to DB
 *   npx tsx --env-file=.env.local scripts/ai-generate-content.ts --offers-only
 *   npx tsx --env-file=.env.local scripts/ai-generate-content.ts --cards-only
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// ── Setup ─────────────────────────────────────────────────────────────────────

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const COMMIT   = process.argv.includes('--commit')
const CARDS_ONLY  = process.argv.includes('--cards-only')
const OFFERS_ONLY = process.argv.includes('--offers-only')
const BATCH_SIZE  = 8  // cards or offers per API call

// ── Placeholder detection ─────────────────────────────────────────────────────

function cardNeedsDescription(desc: string | null | undefined): boolean {
  if (!desc || desc.trim().length < 30) return true
  const lower = desc.toLowerCase()
  // Generic placeholder patterns
  if (/credit card that\b/i.test(lower)) return true
  if (/^(a |an )?(credit card|visa|mastercard|amex)\b/i.test(lower) && lower.length < 60) return true
  return false
}

function offerNeedsHeadline(headline: string | null | undefined, cardName: string): boolean {
  if (!headline || headline.trim().length < 15) return true
  const trimmed = headline.trim().toLowerCase()
  const nameLower = cardName.toLowerCase()
  // Just the card name, no actual offer info
  if (trimmed === nameLower) return true
  if (trimmed.startsWith(nameLower) && trimmed.length < nameLower.length + 20) return true
  return false
}

// ── Card description generation ───────────────────────────────────────────────

type CardRow = {
  id: string
  name: string
  issuer_name: string
  annual_fee: number
  tier: string
  rewards_type: string
  rewards_program: string | null
  foreign_transaction_fee: number | null
  min_income: number | null
  earn_rate_multipliers: Record<string, number> | null
  lounge_access: boolean
  travel_insurance: boolean
  welcome_points: number | null
  welcome_cash: number | null
  welcome_spend: number | null
  welcome_timeframe: number | null
  extra_perks: string[] | null
}

async function generateCardDescriptions(batch: CardRow[]): Promise<{ id: string; short_description: string }[]> {
  const cards = batch.map(c => ({
    id: c.id,
    name: c.name,
    issuer: c.issuer_name,
    annual_fee: c.annual_fee === 0 ? 'No fee' : `$${c.annual_fee}/yr`,
    tier: c.tier,
    rewards: c.rewards_program ?? c.rewards_type,
    fx_fee: c.foreign_transaction_fee === 0 ? 'No FX fee'
      : c.foreign_transaction_fee != null ? `${c.foreign_transaction_fee}% FX fee`
      : null,
    min_income: c.min_income ? `$${c.min_income.toLocaleString()} personal income` : null,
    earn_multipliers: c.earn_rate_multipliers
      ? Object.entries(c.earn_rate_multipliers).map(([k, v]) => `${v}x ${k}`).join(', ')
      : null,
    lounge_access: c.lounge_access || null,
    travel_insurance: c.travel_insurance || null,
    welcome_bonus: c.welcome_points
      ? `${c.welcome_points.toLocaleString()} pts, $${c.welcome_spend?.toLocaleString()} spend, ${c.welcome_timeframe ? Math.round(c.welcome_timeframe / 30) + ' mo' : 'N/A'}`
      : c.welcome_cash
      ? `$${c.welcome_cash} cash back, $${c.welcome_spend?.toLocaleString()} spend`
      : null,
    extra_perks: c.extra_perks?.slice(0, 4) ?? null,
  }))

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a JSON API for a Canadian credit card comparison site. Respond with valid JSON only — no markdown, no explanation.',
    messages: [{
      role: 'user',
      content: `Write a short_description for each Canadian credit card below.

Rules:
- 1-2 factual sentences: what the card is, its key differentiator, who it's best for
- No hype, no superlatives (avoid: "best", "amazing", "perfect", "ultimate")
- Under 160 characters total
- Mention the rewards program by name if relevant (e.g. "Aeroplan", "Avion", "Scene+")
- If no annual fee, mention it
- If earn multipliers exist, mention the highest ones

Cards:
${JSON.stringify(cards, null, 2)}

Respond with a JSON array: [{"id": "...", "short_description": "..."}]`,
    }],
  })

  const raw  = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const parsed = JSON.parse(text) as { id: string; short_description: string }[]
  return parsed.filter(r => r.id && r.short_description)
}

// ── Offer headline generation ─────────────────────────────────────────────────

type OfferRow = {
  id: string
  card_name: string
  offer_type: string
  points_value: number | null
  cashback_value: number | null
  spend_requirement: number | null
  spend_timeframe_days: number | null
  extra_perks: string[] | null
  is_limited_time: boolean
  rewards_program: string | null
}

async function generateOfferHeadlines(batch: OfferRow[]): Promise<{ id: string; headline: string }[]> {
  const offers = batch.map(o => ({
    id: o.id,
    card: o.card_name,
    type: o.offer_type,
    points: o.points_value ?? null,
    rewards_program: o.rewards_program ?? null,
    cashback: o.cashback_value ? `$${o.cashback_value}` : null,
    spend: o.spend_requirement ? `$${o.spend_requirement.toLocaleString()}` : null,
    timeframe: o.spend_timeframe_days ? `${Math.round(o.spend_timeframe_days / 30)} months` : null,
    perks: o.extra_perks?.slice(0, 3) ?? null,
    limited_time: o.is_limited_time || null,
  }))

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a JSON API for a Canadian credit card comparison site. Respond with valid JSON only — no markdown, no explanation.',
    messages: [{
      role: 'user',
      content: `Write a descriptive headline for each credit card offer below.

Rules:
- Lead with the value: "Earn X,XXX [program] points" or "Earn $X cash back"
- Include spend requirement and timeframe if present: "with $X,XXX spend in X months"
- Under 100 characters
- Name the rewards program (e.g. "Aeroplan", "Avion Rewards", "Scene+", "Membership Rewards") instead of just "points" when known
- For additional_offer type with no spend: describe the perk briefly
- No exclamation marks

Offers:
${JSON.stringify(offers, null, 2)}

Respond with a JSON array: [{"id": "...", "headline": "..."}]`,
    }],
  })

  const raw  = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const parsed = JSON.parse(text) as { id: string; headline: string }[]
  return parsed.filter(r => r.id && r.headline)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function truncate(s: string, n = 80) { return s.length > n ? s.slice(0, n - 1) + '…' : s }

// ── Main ──────────────────────────────────────────────────────────────────────

async function processCards() {
  console.log('\n── Card descriptions ─────────────────────────────────────────')

  // Fetch all active cards with enough context for AI
  const { data: cards, error } = await sb
    .from('credit_cards')
    .select(`
      id, name, annual_fee, tier, rewards_type, rewards_program,
      foreign_transaction_fee, min_income, earn_rate_multipliers,
      lounge_access, travel_insurance, short_description, content_source,
      issuers!inner(name)
    `)
    .eq('is_active', true)
    .or('content_source.is.null,content_source.neq.manual')
    .order('name')

  if (error) throw new Error(`Card fetch failed: ${error.message}`)
  if (!cards?.length) { console.log('No active cards found.'); return }

  // Fetch best active welcome offer per card for context
  const cardIds = cards.map(c => c.id)
  const { data: welcomeOffers } = await sb
    .from('card_offers')
    .select('card_id, points_value, cashback_value, spend_requirement, spend_timeframe_days, extra_perks')
    .in('card_id', cardIds)
    .eq('is_active', true)
    .eq('offer_type', 'welcome_bonus')

  const offerByCard = new Map<string, typeof welcomeOffers extends (infer T)[] | null ? T : never>()
  for (const o of welcomeOffers ?? []) {
    const existing = offerByCard.get(o.card_id)
    if (!existing || (o.points_value ?? 0) > (existing.points_value ?? 0)) {
      offerByCard.set(o.card_id, o)
    }
  }

  // Build enriched rows; filter to those needing updates
  const toUpdate: CardRow[] = []
  const skipped: string[] = []

  for (const c of cards) {
    const issuer = Array.isArray(c.issuers) ? c.issuers[0] : c.issuers as { name: string }
    const offer = offerByCard.get(c.id)

    if (c.content_source === 'manual') {
      skipped.push(c.name)
      continue
    }
    if (!cardNeedsDescription(c.short_description) && c.content_source === 'ai_generated') {
      skipped.push(c.name)
      continue
    }
    if (!cardNeedsDescription(c.short_description) && c.content_source != null) {
      skipped.push(c.name)
      continue
    }

    toUpdate.push({
      id: c.id,
      name: c.name,
      issuer_name: issuer?.name ?? '',
      annual_fee: c.annual_fee ?? 0,
      tier: c.tier ?? 'entry',
      rewards_type: c.rewards_type ?? 'points',
      rewards_program: c.rewards_program,
      foreign_transaction_fee: c.foreign_transaction_fee,
      min_income: c.min_income,
      earn_rate_multipliers: c.earn_rate_multipliers,
      lounge_access: c.lounge_access ?? false,
      travel_insurance: c.travel_insurance ?? false,
      welcome_points: offer?.points_value ?? null,
      welcome_cash: offer?.cashback_value ?? null,
      welcome_spend: offer?.spend_requirement ?? null,
      welcome_timeframe: offer?.spend_timeframe_days ?? null,
      extra_perks: offer?.extra_perks ?? null,
    })
  }

  console.log(`  ${toUpdate.length} to update, ${skipped.length} already good / manual`)

  if (toUpdate.length === 0) return

  let updated = 0
  let failed  = 0

  for (const batch of chunk(toUpdate, BATCH_SIZE)) {
    try {
      const results = await generateCardDescriptions(batch)

      if (!COMMIT) {
        // Dry-run: just print
        for (const r of results) {
          const card = batch.find(c => c.id === r.id)
          console.log(`  [dry] ${card?.name}`)
          console.log(`        ${r.short_description}`)
        }
        updated += results.length
      } else {
        for (const r of results) {
          const { error: uErr } = await sb
            .from('credit_cards')
            .update({ short_description: r.short_description, content_source: 'ai_generated' })
            .eq('id', r.id)
          if (uErr) {
            const card = batch.find(c => c.id === r.id)
            console.error(`  ✗ ${card?.name}: ${uErr.message}`)
            failed++
          } else {
            const card = batch.find(c => c.id === r.id)
            console.log(`  ✓ ${card?.name}: ${truncate(r.short_description)}`)
            updated++
          }
        }
      }

      if (batch !== chunk(toUpdate, BATCH_SIZE).at(-1)) await sleep(500)
    } catch (err) {
      console.error(`  Batch failed: ${err instanceof Error ? err.message : String(err)}`)
      failed += batch.length
    }
  }

  console.log(`  ${COMMIT ? 'Written' : 'Would write'}: ${updated} cards, ${failed} failed`)
}

async function processOffers() {
  console.log('\n── Offer headlines ───────────────────────────────────────────')

  const { data: offers, error } = await sb
    .from('card_offers')
    .select(`
      id, offer_type, headline, points_value, cashback_value,
      spend_requirement, spend_timeframe_days, extra_perks,
      is_limited_time, content_source,
      credit_cards!inner(name, rewards_program)
    `)
    .eq('is_active', true)
    .or('content_source.is.null,content_source.neq.manual')
    .order('scraped_at', { ascending: false })

  if (error) throw new Error(`Offer fetch failed: ${error.message}`)
  if (!offers?.length) { console.log('No active offers found.'); return }

  // Filter to those needing headlines
  const toUpdate: OfferRow[] = []
  let skippedCount = 0

  for (const o of offers) {
    const card = Array.isArray(o.credit_cards) ? o.credit_cards[0] : o.credit_cards as { name: string; rewards_program: string | null }

    if (o.content_source === 'manual') { skippedCount++; continue }
    if (!offerNeedsHeadline(o.headline, card?.name ?? '')) {
      if (o.content_source === 'ai_generated' || o.content_source != null) {
        skippedCount++
        continue
      }
    }
    if (!offerNeedsHeadline(o.headline, card?.name ?? '') && o.content_source == null) {
      skippedCount++
      continue
    }

    toUpdate.push({
      id: o.id,
      card_name: card?.name ?? '',
      offer_type: o.offer_type,
      points_value: o.points_value,
      cashback_value: o.cashback_value,
      spend_requirement: o.spend_requirement,
      spend_timeframe_days: o.spend_timeframe_days,
      extra_perks: o.extra_perks,
      is_limited_time: o.is_limited_time,
      rewards_program: card?.rewards_program ?? null,
    })
  }

  console.log(`  ${toUpdate.length} to update, ${skippedCount} already good / manual`)

  if (toUpdate.length === 0) return

  let updated = 0
  let failed  = 0

  for (const batch of chunk(toUpdate, BATCH_SIZE)) {
    try {
      const results = await generateOfferHeadlines(batch)

      if (!COMMIT) {
        for (const r of results) {
          const o = batch.find(x => x.id === r.id)
          console.log(`  [dry] ${o?.card_name} (${o?.offer_type})`)
          console.log(`        old: ${truncate(o?.card_name ?? '—')}`)
          console.log(`        new: ${r.headline}`)
        }
        updated += results.length
      } else {
        for (const r of results) {
          const { error: uErr } = await sb
            .from('card_offers')
            .update({ headline: r.headline, content_source: 'ai_generated' })
            .eq('id', r.id)
          if (uErr) {
            console.error(`  ✗ offer ${r.id}: ${uErr.message}`)
            failed++
          } else {
            const o = batch.find(x => x.id === r.id)
            console.log(`  ✓ ${o?.card_name}: ${truncate(r.headline)}`)
            updated++
          }
        }
      }

      if (batch !== chunk(toUpdate, BATCH_SIZE).at(-1)) await sleep(500)
    } catch (err) {
      console.error(`  Batch failed: ${err instanceof Error ? err.message : String(err)}`)
      failed += batch.length
    }
  }

  console.log(`  ${COMMIT ? 'Written' : 'Would write'}: ${updated} offers, ${failed} failed`)
}

async function main() {
  console.log(`\nai-generate-content — ${COMMIT ? 'COMMIT mode' : 'DRY-RUN mode (pass --commit to write)'}`)

  if (!OFFERS_ONLY) await processCards()
  if (!CARDS_ONLY)  await processOffers()

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

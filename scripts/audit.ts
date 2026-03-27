// scripts/audit.ts
// Usage: npx tsx --env-file=.env.local scripts/audit.ts

import { supabaseAdmin } from '../lib/supabase'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/   // only lowercase alphanum + single hyphens, no trailing dash

interface Issue {
  category: string
  count: number
  detail: string[]
}

function row(label: string, count: number, detail: string[]) {
  return { category: label, count, detail }
}

async function main() {
  const issues: Issue[] = []

  // ── 1. Fetch all active cards ──────────────────────────────────────────────
  const { data: cards, error: cardsErr } = await supabaseAdmin
    .from('credit_cards')
    .select('id, name, slug, apply_url, rewards_program, rewards_type, card_type, tier, short_description, pros, cons, tags, issuer_id, is_active')
    .eq('is_active', true)

  if (cardsErr) throw new Error(`credit_cards fetch: ${cardsErr.message}`)
  const activeCards = cards ?? []
  console.log(`\nAuditing ${activeCards.length} active cards...\n`)

  // ── 2. Null / missing required fields ─────────────────────────────────────
  const REQUIRED = ['slug','name','apply_url','rewards_program','rewards_type','card_type','tier','short_description','pros','cons','tags','issuer_id'] as const
  for (const field of REQUIRED) {
    const bad = activeCards.filter(c => {
      const v = (c as any)[field]
      if (v === null || v === undefined) return true
      if (typeof v === 'string' && v.trim() === '') return true
      return false
    })
    issues.push(row(
      `NULL/missing: ${field}`,
      bad.length,
      bad.map(c => c.name)
    ))
  }

  // ── 3. Bad slugs ──────────────────────────────────────────────────────────
  const badSlugs = activeCards.filter(c => c.slug && !SLUG_RE.test(c.slug))
  issues.push(row(
    'Bad slug (trailing dash / special chars)',
    badSlugs.length,
    badSlugs.map(c => `${c.name} → "${c.slug}"`)
  ))

  // ── 4. Duplicate slugs ────────────────────────────────────────────────────
  const slugCounts: Record<string, number> = {}
  for (const c of activeCards) if (c.slug) slugCounts[c.slug] = (slugCounts[c.slug] ?? 0) + 1
  const dupSlugs = Object.entries(slugCounts).filter(([, n]) => n > 1).map(([s]) => s)
  issues.push(row(
    'Duplicate slugs',
    dupSlugs.length,
    dupSlugs
  ))

  // ── 5. Empty tag arrays {} ────────────────────────────────────────────────
  const emptyTags = activeCards.filter(c => Array.isArray(c.tags) && c.tags.length === 0)
  issues.push(row(
    'Empty tags array {}',
    emptyTags.length,
    emptyTags.map(c => c.name)
  ))

  // ── 6. Active cards with zero active offers ───────────────────────────────
  const { data: offerCounts, error: ocErr } = await supabaseAdmin
    .from('card_offers')
    .select('card_id')
    .eq('is_active', true)

  if (ocErr) throw new Error(`card_offers fetch: ${ocErr.message}`)
  const cardsWithOffers = new Set((offerCounts ?? []).map(o => o.card_id))
  const noOffers = activeCards.filter(c => !cardsWithOffers.has(c.id))
  issues.push(row(
    'Active cards with 0 active offers',
    noOffers.length,
    noOffers.map(c => c.name)
  ))

  // ── 7. Offers with null points_value AND null cashback_value ─────────────
  const { data: offers, error: offErr } = await supabaseAdmin
    .from('card_offers')
    .select('id, headline, card_id, points_value, cashback_value')
    .eq('is_active', true)

  if (offErr) throw new Error(`offers fetch: ${offErr.message}`)
  const nullValueOffers = (offers ?? []).filter(o => o.points_value == null && o.cashback_value == null)
  issues.push(row(
    'Active offers: null points_value AND null cashback_value',
    nullValueOffers.length,
    nullValueOffers.map(o => o.headline)
  ))

  // ── 8. Issuers missing logo_url ───────────────────────────────────────────
  const { data: issuers, error: issErr } = await supabaseAdmin
    .from('issuers')
    .select('id, name, logo_url')

  if (issErr) throw new Error(`issuers fetch: ${issErr.message}`)
  const noLogo = (issuers ?? []).filter(i => !i.logo_url)
  issues.push(row(
    'Issuers missing logo_url',
    noLogo.length,
    noLogo.map(i => i.name)
  ))

  // ── Print summary table ───────────────────────────────────────────────────
  const COL1 = 52
  const COL2 = 7
  const line = '─'.repeat(COL1 + COL2 + 5)

  console.log(line)
  console.log(`${'Category'.padEnd(COL1)} ${'Count'.padStart(COL2)}`)
  console.log(line)

  let totalIssues = 0
  for (const { category, count, detail } of issues) {
    const icon = count === 0 ? '✅' : '❌'
    console.log(`${icon} ${category.padEnd(COL1 - 3)} ${String(count).padStart(COL2)}`)
    if (count > 0) {
      const preview = detail.slice(0, 5).map(d => `     • ${d}`).join('\n')
      console.log(preview)
      if (detail.length > 5) console.log(`     … and ${detail.length - 5} more`)
    }
    totalIssues += count
  }

  console.log(line)
  console.log(`\n${totalIssues === 0 ? '✅ All checks passed — data is clean.' : `❌ Total issues found: ${totalIssues}`}\n`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

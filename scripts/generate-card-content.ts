// scripts/generate-card-content.ts
// Usage: npx tsx --env-file=.env.local scripts/generate-card-content.ts

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VALID_TAGS = [
  'travel', 'cashback', 'no-annual-fee', 'lounge-access', 'no-foreign-fee',
  'hotel', 'airline', 'dining', 'groceries', 'gas', 'student', 'business',
  'premium', 'rewards', 'insurance',
] as const

type Tag = typeof VALID_TAGS[number]

interface CardContent {
  short_description: string
  pros: string[]
  cons: string[]
  tags: Tag[]
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function generateContent(card: {
  name: string
  rewards_program: string | null
  rewards_type: string | null
  card_type: string | null
  tier: string | null
  annual_fee: number | null
  min_income: number | null
}): Promise<CardContent> {
  const prompt = `You are a Canadian credit card expert. Generate content for this card:

Name: ${card.name}
Rewards Program: ${card.rewards_program ?? 'N/A'}
Rewards Type: ${card.rewards_type ?? 'N/A'}
Card Type: ${card.card_type ?? 'N/A'}
Tier: ${card.tier ?? 'N/A'}
Annual Fee: ${card.annual_fee != null ? `$${card.annual_fee} CAD` : 'N/A'}
Min Income Required: ${card.min_income != null ? `$${card.min_income.toLocaleString()} CAD` : 'N/A'}

Return JSON with exactly these fields:
{
  "short_description": "1-2 sentence description of the card's main value proposition (max 160 chars)",
  "pros": ["up to 4 key benefits as short phrases"],
  "cons": ["up to 3 drawbacks as short phrases"],
  "tags": ["relevant tags from the allowed list only"]
}

Allowed tags: ${VALID_TAGS.join(', ')}

Rules:
- short_description must be factual, concise, under 160 characters
- pros: 2-4 items, each under 60 characters
- cons: 1-3 items, each under 60 characters
- tags: only use tags from the allowed list that genuinely apply`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: 'You are a JSON API. Respond with valid JSON only. No markdown, no code blocks, no explanation.',
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed = JSON.parse(text) as CardContent

  // Validate and filter tags to allowed list
  parsed.tags = (parsed.tags ?? []).filter((t): t is Tag => (VALID_TAGS as readonly string[]).includes(t))

  return parsed
}

async function main() {
  // Fetch all active cards
  const { data: cards, error } = await supabaseAdmin
    .from('credit_cards')
    .select('id, name, rewards_program, rewards_type, card_type, tier, annual_fee, min_income')
    .eq('is_active', true)
    .is('short_description', null)
    .order('name')

  if (error) throw new Error(`Failed to fetch cards: ${error.message}`)
  if (!cards?.length) {
    console.log('No active cards found.')
    return
  }

  console.log(`Processing ${cards.length} active cards...\n`)

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]

    try {
      const content = await generateContent(card)

      const { error: updateError } = await supabaseAdmin
        .from('credit_cards')
        .update({
          short_description: content.short_description,
          pros: content.pros,
          cons: content.cons,
          tags: content.tags,
        })
        .eq('id', card.id)

      if (updateError) throw updateError

      console.log(`✅ ${card.name}`)
      successCount++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`❌ ${card.name} — ${msg}`)
      failCount++
    }

    // 500ms delay between calls (skip after last card)
    if (i < cards.length - 1) {
      await sleep(500)
    }
  }

  console.log(`\nDone: ${successCount} ✅  ${failCount} ❌`)

  // Verify no active cards have null short_description
  const { count, error: verifyError } = await supabaseAdmin
    .from('credit_cards')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('short_description', null)

  if (verifyError) {
    console.error('Verification query failed:', verifyError.message)
  } else {
    const nullCount = count ?? 0
    if (nullCount === 0) {
      console.log('\n✅ Verification passed: 0 active cards with null short_description')
    } else {
      console.log(`\n❌ Verification failed: ${nullCount} active cards still have null short_description`)
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

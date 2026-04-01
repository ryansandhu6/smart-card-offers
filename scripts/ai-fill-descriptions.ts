// scripts/ai-fill-descriptions.ts
// Uses Claude to generate short_description for active credit_cards where it is missing.
//
// Run:  npx tsx --env-file=.env.local scripts/ai-fill-descriptions.ts

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function generateDescription(cardName: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 120,
    messages: [
      {
        role: 'user',
        content: `Write a 1-2 sentence description for the ${cardName} credit card in Canada. Focus on who it's best for and its main benefit. Be concise and factual. No marketing fluff.`,
      },
    ],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  return block.text.trim()
}

async function main() {
  // Fetch cards missing short_description
  const { data: cards, error } = await sb
    .from('credit_cards')
    .select('id, name')
    .eq('is_active', true)
    .or('short_description.is.null,short_description.eq.')
    .order('name')

  if (error) throw new Error(`DB fetch failed: ${error.message}`)
  if (!cards || cards.length === 0) {
    console.log('No cards need descriptions — all done.')
    return
  }

  console.log(`Found ${cards.length} card(s) needing descriptions.\n`)

  let success = 0
  let failed = 0

  for (const card of cards) {
    try {
      const description = await generateDescription(card.name)

      const { error: updateError } = await sb
        .from('credit_cards')
        .update({ short_description: description })
        .eq('id', card.id)

      if (updateError) throw new Error(updateError.message)

      console.log(`✓ ${card.name}`)
      console.log(`  ${description}\n`)
      success++
    } catch (err) {
      console.error(`✗ ${card.name}: ${err instanceof Error ? err.message : String(err)}\n`)
      failed++
    }

    // Polite delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`Done: ${success} updated, ${failed} failed.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

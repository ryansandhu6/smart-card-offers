// scripts/fix-missing-images-patch.ts
// Uploads images for cards that fix-missing-images.ts couldn't auto-scrape.
// Hardcoded URLs verified working.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/fix-missing-images-patch.ts

import { supabaseAdmin } from '../lib/supabase'

const SUPABASE_PROJECT_ID = 'nlfaxenxsxtmlaawputs'
const BUCKET = 'card-images'
const PUBLIC_BASE = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/${BUCKET}`

const CARDS = [
  {
    slug: 'mbna-rewards-we-mc',
    imageUrl: 'https://www.mbna.ca/content/dam/mbna/images/credit-cards/tdmb-0006-creditcard-rewards-world-elite-en.png',
  },
  {
    slug: 'tangerine-money-back',
    imageUrl: 'https://www.tangerine.ca/adobe/dynamicmedia/deliver/dm-aid--3df083d4-51bb-4cc0-aca6-b08dde1dfdce/moneybackcompare-18x6-en.png',
  },
  {
    slug: 'amex-biz-gold',
    imageUrl: 'https://icm.aexp-static.com/Internet/internationalcardshop/en_ca/images/cards/Business_Gold_Rewards_Card.png',
  },
  {
    // PoT wraps their Supabase CDN in a Next.js image proxy — inner URL extracted manually
    slug: 'simplii-financial-cash-back-visa-card',
    imageUrl: 'https://kqphqqvkrdovtyhdapud.supabase.co/storage/v1/object/public/media/2024/04/simplii-cash-back-card-1.webp',
  },
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase().split('?')[0] ?? ''
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return `.${ext}`
  } catch {}
  return '.png'
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
  }
  return map[ext] ?? 'image/png'
}

async function main() {
  const slugs = CARDS.map(c => c.slug)
  const { data: dbCards, error } = await supabaseAdmin
    .from('credit_cards')
    .select('id, slug, image_url')
    .in('slug', slugs)

  if (error) { console.error('Failed to fetch cards:', error.message); process.exit(1) }

  const dbMap = Object.fromEntries((dbCards ?? []).map(c => [c.slug, c]))

  let ok = 0, failed = 0

  for (const card of CARDS) {
    console.log(`\n[${card.slug}]`)

    const dbCard = dbMap[card.slug]
    if (!dbCard) { console.log('  NOT FOUND in DB'); failed++; continue }

    if (typeof dbCard.image_url === 'string' && dbCard.image_url.includes(SUPABASE_PROJECT_ID)) {
      console.log('  Already in Supabase Storage — skipping'); ok++; continue
    }

    const ext = extFromUrl(card.imageUrl)
    process.stdout.write(`  Downloading ${card.imageUrl} ... `)

    try {
      const res = await fetch(card.imageUrl, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const bytes = Buffer.from(await res.arrayBuffer())

      const storagePath = `${card.slug}${ext}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, bytes, { contentType: mimeFromExt(ext), upsert: true })
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

      const publicUrl = `${PUBLIC_BASE}/${storagePath}`

      const { error: dbError } = await supabaseAdmin
        .from('credit_cards')
        .update({ image_url: publicUrl })
        .eq('id', dbCard.id)
      if (dbError) throw new Error(`DB update failed: ${dbError.message}`)

      console.log(`OK\n  → ${publicUrl}`)
      ok++
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${failed} failed.`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

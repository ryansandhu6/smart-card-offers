// scripts/fix-missing-images.ts
// One-off script: scrapes issuer pages for card images, uploads to Supabase Storage,
// and updates credit_cards.image_url.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/fix-missing-images.ts

import { supabaseAdmin } from '../lib/supabase'

const SUPABASE_PROJECT_ID = 'nlfaxenxsxtmlaawputs'
const BUCKET = 'card-images'
const PUBLIC_BASE = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/${BUCKET}`

const CARDS: { slug: string; name: string; issuerPage: string; mintflyingKeyword?: string }[] = [
  {
    slug: 'amex-cobalt',
    name: 'Amex Cobalt Card',
    issuerPage: 'https://www.americanexpress.com/en-ca/credit-cards/cobalt-card/',
    mintflyingKeyword: 'american-express-cobalt-card',
  },
  {
    slug: 'amex-biz-gold',
    name: 'Amex Business Gold Card',
    issuerPage: 'https://www.americanexpress.com/en-ca/credit-cards/business-gold-card/',
    mintflyingKeyword: 'american-express-business-gold-card',
  },
  {
    slug: 'bmo-eclipse-visa-infinite',
    name: 'BMO Eclipse Visa Infinite',
    issuerPage: 'https://www.bmo.com/main/personal/credit-cards/bmo-eclipse-visa-infinite/',
    mintflyingKeyword: 'bmo-eclipse-visa-infinite-card',
  },
  {
    slug: 'cibc-aventura-visa-infinite',
    name: 'CIBC Aventura Visa Infinite',
    issuerPage: 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aventura-visa-infinite-card.html',
    mintflyingKeyword: 'cibc-aventura-visa-infinite-card',
  },
  {
    slug: 'cibc-aventura-visa-gold',
    name: 'CIBC Aventura Gold Visa',
    issuerPage: 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aventura-gold-visa-card.html',
    mintflyingKeyword: 'cibc-aventura-gold-visa-card',
  },
  {
    slug: 'mbna-rewards-we-mc',
    name: 'MBNA Rewards World Elite Mastercard',
    issuerPage: 'https://www.mbna.ca/en/credit-cards/rewards/rewards-world-elite-mastercard/',
    mintflyingKeyword: 'mbna-rewards-world-elite-mastercard',
  },
  {
    slug: 'tangerine-money-back',
    name: 'Tangerine Money-Back Credit Card',
    issuerPage: 'https://www.tangerine.ca/en/personal/spend/credit-cards/money-back-credit-card',
    mintflyingKeyword: 'tangerine-money-back-credit-card',
  },
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-CA,en;q=0.9',
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase().split('?')[0] ?? ''
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return `.${ext}`
  } catch {}
  return '.webp'
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.svg': 'image/svg+xml',
  }
  return map[ext] ?? 'image/webp'
}

// Extract og:image from HTML string
function extractOgImage(html: string): string | null {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  return match ? match[1] : null
}

// Extract likely card image from HTML — looks for <img> with card-related alt or src
function extractCardImage(html: string, cardName: string, baseUrl: string): string | null {
  const nameParts = cardName.toLowerCase().split(' ').filter(w => w.length > 3)

  // Find all img tags
  const imgRegex = /<img[^>]+>/gi
  const imgs = html.match(imgRegex) ?? []

  for (const img of imgs) {
    const srcMatch = img.match(/src=["']([^"']+)["']/i)
    const altMatch = img.match(/alt=["']([^"']*?)["']/i)
    if (!srcMatch) continue

    const src = srcMatch[1]
    const alt = (altMatch?.[1] ?? '').toLowerCase()

    // Skip tiny icons, logos, spacers
    if (src.includes('logo') || src.includes('icon') || src.includes('spacer') || src.includes('pixel')) continue
    if (src.endsWith('.svg') && !src.includes('card')) continue

    // Prefer images where alt text matches card name keywords
    const altMatches = nameParts.filter(p => alt.includes(p)).length
    if (altMatches >= 2) {
      return src.startsWith('http') ? src : new URL(src, baseUrl).href
    }
  }

  // Second pass: look for card-image in class or data attributes
  for (const img of imgs) {
    const srcMatch = img.match(/src=["']([^"']+)["']/i)
    if (!srcMatch) continue
    const src = srcMatch[1]
    if (img.toLowerCase().includes('card-image') || img.toLowerCase().includes('card_image') || img.toLowerCase().includes('cardimage')) {
      return src.startsWith('http') ? src : new URL(src, baseUrl).href
    }
  }

  return null
}

async function findImageUrl(card: typeof CARDS[0]): Promise<string | null> {
  // 1. Try issuer page
  try {
    const res = await fetch(card.issuerPage, { headers: HEADERS, signal: AbortSignal.timeout(15_000) })
    if (res.ok) {
      const html = await res.text()

      // Try og:image first
      const ogImg = extractOgImage(html)
      if (ogImg && !ogImg.includes('logo') && !ogImg.includes('default')) {
        console.log(`  og:image found: ${ogImg}`)
        return ogImg
      }

      // Fall back to scraping img tags
      const cardImg = extractCardImage(html, card.name, card.issuerPage)
      if (cardImg) {
        console.log(`  img tag found: ${cardImg}`)
        return cardImg
      }

      console.log(`  No image found in page HTML (status ${res.status})`)
    } else {
      console.log(`  Issuer page returned ${res.status}`)
    }
  } catch (err) {
    console.log(`  Issuer page fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2. Fall back to MintFlying
  if (card.mintflyingKeyword) {
    const mintUrl = `https://www.mintflying.com/credit-cards/${card.mintflyingKeyword}.webp`
    try {
      const res = await fetch(mintUrl, { method: 'HEAD', headers: HEADERS, signal: AbortSignal.timeout(8_000) })
      if (res.ok && res.headers.get('content-type')?.includes('image')) {
        console.log(`  MintFlying fallback: ${mintUrl}`)
        return mintUrl
      }
      console.log(`  MintFlying ${res.status}: ${mintUrl}`)
    } catch (err) {
      console.log(`  MintFlying fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return null
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function uploadAndUpdate(slug: string, imageUrl: string, cardId: string): Promise<void> {
  const ext = extFromUrl(imageUrl)
  const bytes = await fetchImageBytes(imageUrl)
  const storagePath = `${slug}${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mimeFromExt(ext), upsert: true })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  const publicUrl = `${PUBLIC_BASE}/${storagePath}`

  const { error: dbError } = await supabaseAdmin
    .from('credit_cards')
    .update({ image_url: publicUrl })
    .eq('id', cardId)

  if (dbError) throw new Error(`DB update failed: ${dbError.message}`)

  console.log(`  → ${publicUrl}`)
}

async function main() {
  // Fetch DB IDs for our target cards
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
    if (!dbCard) { console.log('  NOT FOUND in DB — skipping'); failed++; continue }

    if (typeof dbCard.image_url === 'string' && dbCard.image_url.includes('supabase.co')) {
      console.log('  Already in Supabase Storage — skipping')
      ok++
      continue
    }

    const imageUrl = await findImageUrl(card)
    if (!imageUrl) { console.log('  No image URL found — skipping'); failed++; continue }

    try {
      await uploadAndUpdate(card.slug, imageUrl, dbCard.id)
      ok++
    } catch (err) {
      console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n✓ Done. ${ok} succeeded, ${failed} failed.`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

// scripts/download-card-images.ts
// Uploads remote card images to Supabase Storage bucket 'card-images' and updates image_url.
//
// - Skips cards where image_url already contains 'supabase.co' (already migrated)
// - Skips cards with no image_url
// - Handles all active cards — PoT covers ~97; the rest get skipped unless manually set
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local ts-node -r dotenv/config scripts/download-card-images.ts
//
// Bucket setup (one-time in Supabase dashboard):
//   Storage → New bucket → name: "card-images" → Public: ON

import { supabaseAdmin } from '../lib/supabase'

const SUPABASE_PROJECT_ID = 'nlfaxenxsxtmlaawputs'
const BUCKET = 'card-images'
const PUBLIC_BASE = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/${BUCKET}`

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return `.${ext}`
  } catch {}
  return '.png'
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  }
  return map[ext] ?? 'image/png'
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 SmartCardOffers-ImageBot/1.0' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } finally {
    clearTimeout(timeout)
  }
}

async function uploadToStorage(slug: string, ext: string, bytes: Buffer): Promise<string> {
  const storagePath = `${slug}${ext}`
  const contentType = mimeFromExt(ext)

  // upsert: true overwrites if re-running for the same slug
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  return `${PUBLIC_BASE}/${storagePath}`
}

async function main() {
  // Fetch all cards that have a remote image URL but aren't already on Supabase Storage
  const { data: cards, error } = await supabaseAdmin
    .from('credit_cards')
    .select('id, slug, image_url')
    .not('image_url', 'is', null)
    .not('image_url', 'ilike', '%nlfaxenxsxtmlaawputs.supabase.co%')

  if (error) {
    console.error('Failed to fetch cards:', error.message)
    process.exit(1)
  }

  if (!cards || cards.length === 0) {
    console.log('No cards with remote image URLs found — all images may already be in Supabase Storage.')
    return
  }

  console.log(`Found ${cards.length} cards with remote image URLs to migrate.\n`)

  let uploaded = 0
  let failed = 0
  let skipped = 0

  for (const card of cards) {
    const url = card.image_url as string

    // Skip local paths (shouldn't exist in prod, but guard anyway)
    if (url.startsWith('/')) {
      console.log(`[${card.slug}] SKIP — local path: ${url}`)
      skipped++
      continue
    }

    const ext = extFromUrl(url)
    process.stdout.write(`[${card.slug}] ${url} ... `)

    try {
      const bytes = await fetchImageBytes(url)
      const publicUrl = await uploadToStorage(card.slug as string, ext, bytes)

      const { error: updateError } = await supabaseAdmin
        .from('credit_cards')
        .update({ image_url: publicUrl })
        .eq('id', card.id)

      if (updateError) {
        console.log(`UPLOAD OK but DB update failed: ${updateError.message}`)
        failed++
      } else {
        console.log(`OK → ${publicUrl}`)
        uploaded++
      }
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    // Avoid hammering CDNs
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone. ${uploaded} uploaded, ${failed} failed, ${skipped} skipped.`)

  if (failed > 0) {
    console.log('\nFailed cards will retain their original URLs — re-run the script to retry them.')
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})

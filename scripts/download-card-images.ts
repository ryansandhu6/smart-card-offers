// scripts/download-card-images.ts
// Downloads remote card images to public/images/cards/ and updates Supabase image_url to local path.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local ts-node -r dotenv/config scripts/download-card-images.ts

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { supabaseAdmin } from '../lib/supabase'

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'images', 'cards')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname).toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) return ext
  } catch {}
  return '.png'
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)

    const req = proto.get(url, { timeout: 15_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow one redirect
        file.close()
        fs.unlink(dest, () => {})
        downloadFile(res.headers.location!, dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dest, () => {})
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    })

    req.on('error', (err) => {
      file.close()
      fs.unlink(dest, () => {})
      reject(err)
    })

    req.on('timeout', () => {
      req.destroy()
      file.close()
      fs.unlink(dest, () => {})
      reject(new Error(`Timeout downloading ${url}`))
    })
  })
}

async function main() {
  ensureDir(OUTPUT_DIR)

  // Fetch all cards with a remote image_url (not already a local path)
  const { data: cards, error } = await supabaseAdmin
    .from('credit_cards')
    .select('id, slug, image_url')
    .not('image_url', 'is', null)
    .not('image_url', 'like', '/images/%')

  if (error) {
    console.error('Failed to fetch cards:', error.message)
    process.exit(1)
  }

  if (!cards || cards.length === 0) {
    console.log('No cards with remote image URLs found.')
    return
  }

  console.log(`Found ${cards.length} cards with remote image URLs.\n`)

  let downloaded = 0
  let failed = 0

  for (const card of cards) {
    const url = card.image_url as string
    const ext = extFromUrl(url)
    const filename = `${card.slug}${ext}`
    const localPath = path.join(OUTPUT_DIR, filename)
    const publicPath = `/images/cards/${filename}`

    process.stdout.write(`[${card.slug}] Downloading ${url} ... `)

    try {
      await downloadFile(url, localPath)

      const { error: updateError } = await supabaseAdmin
        .from('credit_cards')
        .update({ image_url: publicPath })
        .eq('id', card.id)

      if (updateError) {
        console.log(`DOWNLOAD OK but DB update failed: ${updateError.message}`)
        failed++
      } else {
        console.log(`OK → ${publicPath}`)
        downloaded++
      }
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    // Small delay to avoid hammering CDNs
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone. ${downloaded} downloaded, ${failed} failed.`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})

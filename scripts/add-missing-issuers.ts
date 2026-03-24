// scripts/add-missing-issuers.ts
// One-off script to insert MBNA and Rogers Bank into the issuers table.
// Run: DOTENV_CONFIG_PATH=.env.local ts-node -r dotenv/config scripts/add-missing-issuers.ts

import { supabaseAdmin } from '../lib/supabase'

const ISSUERS = [
  { name: 'MBNA', slug: 'mbna', website: 'https://www.mbna.ca' },
  { name: 'Rogers Bank', slug: 'rogers-bank', website: 'https://www.rogersbank.com' },
]

async function main() {
  console.log('Inserting missing issuers...')
  for (const issuer of ISSUERS) {
    const { error } = await supabaseAdmin
      .from('issuers')
      .upsert(issuer, { onConflict: 'slug' })

    if (error) console.error(`  ✗ ${issuer.name}: ${error.message}`)
    else console.log(`  ✅ ${issuer.name}`)
  }
  console.log('Done.')
}

main().catch(console.error)

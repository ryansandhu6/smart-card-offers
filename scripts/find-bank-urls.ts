// scripts/find-bank-urls.ts — find current product page URLs for each bank
// Run: DOTENV_CONFIG_PATH=.env.local npx ts-node -r dotenv/config scripts/find-bank-urls.ts

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function getLinks(label: string, url: string, keywords: string[]) {
  console.log(`\n[${label}] Fetching ${url}`)
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-CA,en;q=0.9' },
    redirect: 'follow',
  })
  const html = await r.text()
  console.log(`  HTTP ${r.status} | ${html.length} bytes`)

  // Find all href values
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1])
  // Find data-url / data-href / action attributes too
  const dataUrls = [...html.matchAll(/(?:data-url|data-href|action)=["']([^"']+)["']/gi)].map(m => m[1])
  // Find anything in quotes that looks like a path
  const pathsInQuotes = [...html.matchAll(/"(\/[a-z][a-z0-9/_-]{10,}\.html?)"/gi)].map(m => m[1])

  const all = [...new Set([...hrefs, ...dataUrls, ...pathsInQuotes])]

  // Filter to paths containing any of the keywords
  for (const kw of keywords) {
    const matches = all.filter(h => h.toLowerCase().includes(kw.toLowerCase()))
    if (matches.length) {
      console.log(`  [${kw}] matches:`)
      matches.slice(0, 6).forEach(h => console.log(`    ${h}`))
    }
  }

  await new Promise(r => setTimeout(r, 1500))
}

async function testUrl(label: string, url: string) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-CA,en;q=0.9' },
    redirect: 'follow',
  })
  const html = await r.text()
  console.log(`  ${label}: HTTP ${r.status} | ${html.length}b`)
  // Print first 500 chars to check if it's a 404 page or real page
  const preview = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300)
  console.log(`  Preview: ${preview}`)
  await new Promise(r => setTimeout(r, 800))
}

async function main() {
  // ── Scotiabank ──
  await getLinks('scotiabank-listing', 'https://www.scotiabank.com/ca/en/personal/credit-cards.html',
    ['passport', 'momentum', 'gold', 'infinite', 'american-express'])

  // ── BMO — try alternate listing URLs ──
  await getLinks('bmo-listing-v2', 'https://www.bmo.com/en-ca/personal/credit-cards/',
    ['eclipse', 'ascend', 'air-miles', 'cashback', 'world-elite'])
  await getLinks('bmo-listing-v3', 'https://www.bmo.com/en-ca/banking/credit-cards/',
    ['eclipse', 'ascend', 'air-miles'])

  // ── RBC — listing returned 200, check for links ──
  await getLinks('rbc-listing', 'https://www.rbcroyalbank.com/credit-cards/index.html',
    ['avion', 'westjet', 'ion', 'cash-back', 'british-airways'])

  // ── CIBC — listing returned 200 ──
  await getLinks('cibc-listing', 'https://www.cibc.com/en/personal-banking/credit-cards.html',
    ['aventura', 'aeroplan', 'dividend', 'infinite'])

  // ── Test specific URL candidates ──
  console.log('\n=== Testing individual card URL candidates ===\n')

  // Scotiabank - try alternate paths
  await testUrl('scotia-passport-v1', 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/scotiabank-passporttm-visa-infiniter-card.html')
  await testUrl('scotia-passport-v2', 'https://www.scotiabank.com/ca/en/personal/credit-cards/scotiabank-passporttm-visa-infinite-card.html')
  await testUrl('scotia-momentum-v1', 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/scotia-momentumr-visa-infinite-card.html')

  // BMO - try new-style URLs
  await testUrl('bmo-eclipse-v2', 'https://www.bmo.com/en-ca/personal/credit-cards/bmo-eclipse-visa-infinite-card/')
  await testUrl('bmo-eclipse-v3', 'https://www.bmo.com/en-ca/banking/credit-cards/bmo-eclipse-visa-infinite/')
  await testUrl('bmo-ascend-v2', 'https://www.bmo.com/en-ca/personal/credit-cards/bmo-ascend-world-elite-mastercard/')

  // RBC
  await testUrl('rbc-avion-v2', 'https://www.rbcroyalbank.com/personal/credit-cards/avion-visa-infinite.html')
  await testUrl('rbc-westjet-v2', 'https://www.rbcroyalbank.com/personal/credit-cards/westjet-world-elite-mastercard.html')
  await testUrl('rbc-avion-v3', 'https://www.rbcroyalbank.com/credit-cards/rbc-avion-visa-infinite-card.html')

  // CIBC
  await testUrl('cibc-aventura-v2', 'https://www.cibc.com/en/personal-banking/credit-cards/aventura-visa-infinite-card.html')
  await testUrl('cibc-aeroplan-v2', 'https://www.cibc.com/en/personal-banking/credit-cards/aeroplan-visa-infinite.html')
}

main().catch(console.error)

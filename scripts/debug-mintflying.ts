async function main() {
  const res = await fetch('https://www.mintflying.com/credit-cards', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-CA,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
  })
  const html = await res.text()
  console.log('Status:', res.status)
  console.log('Length:', html.length)
  console.log('Has signupBonus:', html.includes('signupBonus'))
  console.log('Has __next_f:', html.includes('__next_f'))
  console.log('First 300 chars:', html.slice(0, 300))
  if (html.includes('signupBonus')) {
    const idx = html.indexOf('signupBonus')
    console.log('\nContext around signupBonus:', html.slice(Math.max(0, idx-100), idx+200))
  }
}

main().catch(console.error)

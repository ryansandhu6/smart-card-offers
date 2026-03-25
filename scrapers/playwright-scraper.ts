// scrapers/playwright-scraper.ts
// Use this when fetch + Cheerio doesn't work (JS-rendered pages, bot detection)
// Requires: npm install playwright && npx playwright install chromium

// This is an OPTIONAL upgrade from the fetch-based scrapers.
// Most bank sites work fine with fetch. Use Playwright if you're getting
// empty results or bot blocks (403, captchas, empty divs).

import { BaseScraper } from '../lib/scraper-base'
import type { ScrapedOffer } from '../types'

// -----------------------------------------------
// Stealth configuration
// -----------------------------------------------

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
]

// Viewport + deviceScaleFactor combos — mixes standard and retina screens
const VIEWPORTS = [
  { width: 1366, height: 768,  deviceScaleFactor: 1 },
  { width: 1440, height: 900,  deviceScaleFactor: 2 },
  { width: 1536, height: 864,  deviceScaleFactor: 1 },
  { width: 1920, height: 1080, deviceScaleFactor: 1 },
  { width: 1280, height: 800,  deviceScaleFactor: 2 },
]

// Cookie consent selectors common on Canadian bank sites
const COOKIE_SELECTORS = [
  'button[id*="accept"]',
  'button[class*="accept"]',
  'button[aria-label*="Accept"]',
  'button[aria-label*="accept"]',
  '[data-testid*="cookie-accept"]',
  '#onetrust-accept-btn-handler',
  '.onetrust-close-btn-handler',
  'button:has-text("Accept All")',
  'button:has-text("Accept Cookies")',
  'button:has-text("I Accept")',
  'button:has-text("Agree")',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min))
}

// -----------------------------------------------
// Stealth init script — injected before any page JS
// Mirrors the core patches from puppeteer-extra-plugin-stealth
// -----------------------------------------------
const STEALTH_INIT_SCRIPT = `
  // 1. Hide navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });

  // 2. Spoof navigator.plugins with realistic entries
  const makePlugin = (name, filename, description, mimeTypes) => {
    const plugin = Object.create(Plugin.prototype);
    Object.defineProperties(plugin, {
      name:        { value: name,        enumerable: true },
      filename:    { value: filename,    enumerable: true },
      description: { value: description, enumerable: true },
      length:      { value: mimeTypes.length, enumerable: true },
    });
    mimeTypes.forEach((mt, i) => { plugin[i] = mt; });
    return plugin;
  };
  const fakePlugins = [
    makePlugin('Chrome PDF Plugin',        'internal-pdf-viewer',  'Portable Document Format', []),
    makePlugin('Chrome PDF Viewer',        'mhjfbmdgcfjbbpaeojofohoefgiehjai', '', []),
    makePlugin('Native Client',            'internal-nacl-plugin', '', []),
  ];
  Object.defineProperty(navigator, 'plugins', {
    get: () => Object.assign(Object.create(PluginArray.prototype), fakePlugins, { length: fakePlugins.length }),
    configurable: true,
  });

  // 3. Spoof navigator.languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-CA', 'en', 'fr-CA'],
    configurable: true,
  });

  // 4. Spoof navigator.platform
  Object.defineProperty(navigator, 'platform', {
    get: () => 'Win32',
    configurable: true,
  });

  // 5. Expose window.chrome so bot-detection scripts see a real browser
  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', {
      value: { runtime: {}, loadTimes: () => ({}), csi: () => ({}), app: {} },
      configurable: true,
      writable: true,
    });
  }

  // 6. Make Notification.permission look like a real browser (not 'denied' default in headless)
  try {
    Object.defineProperty(Notification, 'permission', {
      get: () => 'default',
      configurable: true,
    });
  } catch (_) {}
`

// -----------------------------------------------
// Browser factory — lazy-loaded, stealth args
// -----------------------------------------------
let chromium: any = null

async function getBrowser() {
  if (!chromium) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error — playwright is an optional dependency; install separately if needed
    const pw = await import('playwright')
    chromium = pw.chromium
  }
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // Stealth args — suppress headless signals
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--lang=en-CA',
    ],
  })
}

// -----------------------------------------------
// Playwright base scraper — extend this for any
// bank that blocks fetch-based scrapers
// -----------------------------------------------
export abstract class PlaywrightScraper extends BaseScraper {
  protected async fetchWithBrowser(
    url: string,
    waitSelector?: string
  ): Promise<string> {
    const ua = pick(USER_AGENTS)
    const { deviceScaleFactor, ...viewportSize } = pick(VIEWPORTS)

    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: ua,
      locale: 'en-CA',
      timezoneId: 'America/Toronto',
      viewport: viewportSize,
      deviceScaleFactor,
      serviceWorkers: 'block',
      extraHTTPHeaders: {
        'Accept-Language': 'en-CA,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        // Referrer — looks like organic Google Canada search traffic
        'Referer': 'https://www.google.ca/',
      },
    })

    // Inject stealth patches before any page script runs
    await context.addInitScript(STEALTH_INIT_SCRIPT)

    // Block unnecessary resources for speed
    await context.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}', (r: any) => r.abort())
    await context.route('**/analytics**', (r: any) => r.abort())
    await context.route('**/googletagmanager**', (r: any) => r.abort())

    const page = await context.newPage()

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      })

      // --- Cookie consent ---
      await this.dismissCookieBanner(page)

      // --- Simulate human mouse movement (2–3 random moves) ---
      await this.simulateMouseMovement(page, viewportSize)

      if (waitSelector) {
        await page.waitForSelector(waitSelector, { timeout: 8_000 }).catch(() => {})
      }

      // --- Simulate human scroll: down 300–600px then back up ---
      await this.simulateScroll(page)

      // Random settle delay (500–1500ms)
      await page.waitForTimeout(randInt(500, 1_500))

      const html = await page.content()
      return html
    } finally {
      await page.close()
      await context.close()
      await browser.close()
    }
  }

  private async dismissCookieBanner(page: any): Promise<void> {
    for (const selector of COOKIE_SELECTORS) {
      try {
        const btn = await page.$(selector)
        if (btn) {
          await btn.click()
          await page.waitForTimeout(randInt(300, 600))
          return
        }
      } catch {
        // selector not found or not clickable — try next
      }
    }
  }

  private async simulateMouseMovement(
    page: any,
    viewport: { width: number; height: number }
  ): Promise<void> {
    const moves = randInt(2, 4) // 2 or 3 moves
    for (let i = 0; i < moves; i++) {
      const x = randInt(100, viewport.width - 100)
      const y = randInt(100, viewport.height - 100)
      await page.mouse.move(x, y, { steps: randInt(5, 15) })
      await page.waitForTimeout(randInt(80, 250))
    }
  }

  private async simulateScroll(page: any): Promise<void> {
    const scrollDown = randInt(300, 600)
    await page.evaluate((px: number) => window.scrollBy({ top: px, behavior: 'smooth' }), scrollDown)
    await page.waitForTimeout(randInt(400, 800))
    await page.evaluate((px: number) => window.scrollBy({ top: -px, behavior: 'smooth' }), scrollDown)
    await page.waitForTimeout(randInt(200, 500))
  }

  abstract scrape(): Promise<ScrapedOffer[]>
}

// -----------------------------------------------
// Usage note:
//
// The fetch-based scrapers in scrapers/banks.ts work for
// most sites. Only upgrade to Playwright if you're seeing:
//   - Empty offer text being scraped
//   - 403 / bot detection errors
//   - console.error output consistently from a scraper
//
// Playwright adds ~2s per page (browser startup) vs ~200ms for fetch.
// -----------------------------------------------

// lib/rate-limit.ts
// IP-based rate limiter for API routes.
//
// Uses @upstash/ratelimit + @upstash/redis when both env vars are present
// (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) and the packages are installed.
//
// Falls back to a process-local in-memory fixed window when Upstash is not
// configured. The in-memory store is per-process and does not sync across
// Vercel function replicas — acceptable for low-frequency endpoints like newsletter
// signups, but install Upstash for production multi-region deployments.

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

// ── In-memory fallback ────────────────────────────────────────────────────────

const memStore = new Map<string, { count: number; windowStart: number }>()

function inMemoryCheck(
  key:      string,
  limit:    number,
  windowMs: number
): RateLimitResult {
  const now   = Date.now()
  const entry = memStore.get(key)

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    memStore.set(key, { count: 1, windowStart: now })
    return { allowed: true }
  }

  if (entry.count < limit) {
    entry.count++
    return { allowed: true }
  }

  const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000)
  return { allowed: false, retryAfterSeconds }
}

// ── Upstash initialisation (optional) ────────────────────────────────────────

type UpstashLimiter = {
  limit: (key: string) => Promise<{ success: boolean; reset: number }>
}

let upstashLimiter: UpstashLimiter | null = null

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require('@upstash/ratelimit')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis }     = require('@upstash/redis')

    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })

    upstashLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      prefix:  '@newsletter',
    }) as UpstashLimiter

  } catch {
    console.warn(
      '[rate-limit] Upstash env vars set but packages not installed — falling back to in-memory. ' +
      'Run: npm install @upstash/ratelimit @upstash/redis'
    )
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether `key` (typically an IP address) is within the rate limit.
 *
 * @param key      Identifier to rate-limit against (IP, email, etc.)
 * @param limit    Max allowed requests per window (default 3)
 * @param windowMs Window duration in ms (default 1 hour). Ignored when using
 *                 Upstash — the window is fixed at 1 h in the limiter config.
 */
export async function checkRateLimit(
  key:      string,
  limit     = 3,
  windowMs  = 60 * 60 * 1000   // 1 hour
): Promise<RateLimitResult> {
  if (upstashLimiter) {
    const { success, reset } = await upstashLimiter.limit(key)
    if (success) return { allowed: true }
    const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000)
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) }
  }

  return inMemoryCheck(key, limit, windowMs)
}

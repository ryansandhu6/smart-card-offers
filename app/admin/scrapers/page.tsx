'use client'
import { useEffect, useState } from 'react'

type ScrapeLog = {
  scraper_name: string
  ran_at: string
  status: string
  records_found: number
  records_updated: number
  records_skipped: number
  duration_ms: number
  error_message: string | null
}

type RunResult = {
  status: string
  records_found: number
  records_updated: number
  records_skipped: number
  duration_ms: number
  error?: string
}

const SCRAPERS = [
  // ChurningCanada is temporarily disabled pending data verification.
  // Code is preserved; re-enable by setting disabled: false and restoring it to
  // the cron routes (scrape/fast and scrape/route).
  { id: 'churningcanada', label: 'ChurningCanada',  desc: 'SHA-gated GitHub README scrape (~5s)', disabled: true  },
  { id: 'princeoftravel', label: 'Prince of Travel', desc: 'Per-card Next.js RSC scrape (~3 min)', disabled: false },
  { id: 'mintflying',     label: 'MintFlying',       desc: 'Aggregator HTML scrape (~1 min)',      disabled: false },
]

export default function ScrapersPage() {
  const [logs, setLogs]           = useState<Record<string, ScrapeLog>>({})
  const [running, setRunning]     = useState<string | null>(null)
  const [results, setResults]     = useState<Record<string, RunResult & { at: string }>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  async function loadLogs() {
    try {
      const res = await fetch('/api/scrape-logs')
      const json = await res.json()
      // Latest run per scraper
      const map: Record<string, ScrapeLog> = {}
      for (const log of (json.logs ?? []) as ScrapeLog[]) {
        if (!map[log.scraper_name]) map[log.scraper_name] = log
      }
      setLogs(map)
    } catch {
      setLoadError('Failed to load scrape logs')
    }
  }

  useEffect(() => { loadLogs() }, [])

  async function triggerScraper(id: string) {
    setRunning(id)
    const startedAt = new Date().toISOString()
    try {
      const res = await fetch('/api/admin/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scraper: id }),
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [id]: { ...data, at: startedAt } }))
      await loadLogs()
    } catch (e) {
      setResults(prev => ({
        ...prev,
        [id]: { status: 'failed', records_found: 0, records_updated: 0, records_skipped: 0, duration_ms: 0, error: String(e), at: startedAt },
      }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Scrapers</h1>

      {loadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{loadError}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {SCRAPERS.map(s => {
          const last   = logs[s.id]
          const result = results[s.id]
          const isRunning = running === s.id

          return (
            <div key={s.id} className={`bg-white rounded-lg shadow p-5 flex flex-col gap-4 ${s.disabled ? 'opacity-60' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.label}</span>
                  {s.disabled && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                      disabled
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
                {s.disabled && (
                  <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mt-2">
                    Temporarily disabled — pending verification.
                  </p>
                )}
              </div>

              {/* Last DB log */}
              {last && (
                <div className="text-xs space-y-0.5 border-t pt-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last run</span>
                    <StatusBadge status={last.status} />
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>{new Date(last.ran_at).toLocaleString('en-CA', {
                      timeZone: 'America/Toronto', dateStyle: 'short', timeStyle: 'short',
                    })}</span>
                    <span>{((last.duration_ms ?? 0) / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>{last.records_found} found</span>
                    <span>{last.records_updated} updated · {last.records_skipped} skipped</span>
                  </div>
                  {last.error_message && (
                    <p className="text-red-600 mt-1 break-all">{last.error_message}</p>
                  )}
                </div>
              )}

              {/* Live result from this session */}
              {result && (
                <div className="text-xs border border-gray-200 rounded bg-gray-50 px-3 py-2 space-y-0.5">
                  <div className="flex justify-between font-medium">
                    <span>Run at {new Date(result.at).toLocaleTimeString('en-CA')}</span>
                    <StatusBadge status={result.status} />
                  </div>
                  <div className="text-gray-500">
                    {result.records_updated} updated · {result.records_skipped} skipped · {((result.duration_ms ?? 0) / 1000).toFixed(1)}s
                  </div>
                  {result.error && <p className="text-red-600 break-all">{result.error}</p>}
                </div>
              )}

              <button
                onClick={() => triggerScraper(s.id)}
                disabled={!!running || s.disabled}
                className={`mt-auto rounded px-4 py-2 text-sm font-medium transition-colors
                  ${s.disabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isRunning
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40'
                  }`}
              >
                {isRunning ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Running…
                  </span>
                ) : s.disabled ? 'Disabled' : 'Run now'}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        Scrapers run server-side. PrinceOfTravel may take 3–5 minutes — keep this tab open.
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'success' ? 'bg-green-100 text-green-700' :
    status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                           'bg-red-100 text-red-700'
  return <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

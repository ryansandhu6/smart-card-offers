import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const [
    { count: cardCount },
    { count: offerCount },
    { count: pendingCount },
    { data: logs },
    { data: allActiveCards },
    { data: cardsWithOffers },
    { count: qualityCount },
  ] = await Promise.all([
    supabaseAdmin
      .from('credit_cards')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
    supabaseAdmin
      .from('card_offers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
    supabaseAdmin
      .from('card_offers')
      .select('*', { count: 'exact', head: true })
      .eq('review_status', 'pending_review'),
    supabaseAdmin
      .from('scrape_logs')
      .select('scraper_name, ran_at, status, records_found, records_updated, records_skipped, duration_ms, error_message')
      .neq('scraper_name', 'churningcanada-sha')
      .order('ran_at', { ascending: false })
      .limit(30),
    supabaseAdmin
      .from('credit_cards')
      .select('id, name, slug')
      .eq('is_active', true),
    supabaseAdmin
      .from('card_offers')
      .select('card_id')
      .eq('is_active', true),
    supabaseAdmin
      .from('card_offers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('spend_requirement', 'is', null)
      .not('details', 'is', null),
  ])

  // Cards with no active offers
  const withOfferSet = new Set((cardsWithOffers ?? []).map(r => r.card_id))
  const noOfferCards = (allActiveCards ?? []).filter(c => !withOfferSet.has(c.id))

  // Data quality score: % of active offers with both details and spend_requirement
  const qualityPct = offerCount ? Math.round(((qualityCount ?? 0) / offerCount) * 100) : 0

  type LogRow = { scraper_name: string; ran_at: string; status: string; records_found: number; records_updated: number; records_skipped: number; duration_ms: number; error_message: string | null }
  const byScraperMap = new Map<string, LogRow>()
  for (const row of logs ?? []) {
    if (!byScraperMap.has(row.scraper_name)) byScraperMap.set(row.scraper_name, row)
  }
  const latestRuns = [...byScraperMap.values()]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Active Cards"    value={cardCount  ?? 0} />
        <Stat label="Active Offers"   value={offerCount ?? 0} />
        <StatLink
          label="Pending Review"
          value={pendingCount ?? 0}
          href="/admin/review"
          highlight={(pendingCount ?? 0) > 0}
        />
        <StatPct
          label="Data Quality"
          pct={qualityPct}
          sub="description + spend filled"
        />
      </div>

      {/* Cards with no active offers */}
      {noOfferCards.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">
            Cards with No Active Offers
            <span className="ml-2 text-sm font-normal text-gray-500">({noOfferCards.length})</span>
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Card</th>
                  <th className="px-4 py-2 text-left">Slug</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {noOfferCards.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{c.slug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scraper status */}
      <section>
        <h2 className="text-lg font-medium mb-3">Last Scraper Runs</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <Th>Scraper</Th>
                <Th>Status</Th>
                <Th>Found</Th>
                <Th>Updated</Th>
                <Th>Skipped</Th>
                <Th>Duration</Th>
                <Th>Ran At (ET)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {latestRuns.map(r => (
                <tr key={r.scraper_name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{r.scraper_name}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 tabular-nums">{r.records_found}</td>
                  <td className="px-4 py-3 tabular-nums">{r.records_updated}</td>
                  <td className="px-4 py-3 tabular-nums">{r.records_skipped}</td>
                  <td className="px-4 py-3 tabular-nums">{((r.duration_ms ?? 0) / 1000).toFixed(1)}s</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(r.ran_at).toLocaleString('en-CA', {
                      timeZone: 'America/Toronto',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                </tr>
              ))}
              {latestRuns.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No runs yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {latestRuns.some(r => r.error_message) && (
          <div className="mt-3 space-y-2">
            {latestRuns.filter(r => r.error_message).map(r => (
              <p key={r.scraper_name} className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                <span className="font-semibold">{r.scraper_name}:</span> {r.error_message}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="text-3xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function StatLink({ label, value, href, highlight }: { label: string; value: number; href: string; highlight: boolean }) {
  return (
    <Link href={href} className={`rounded-lg shadow p-5 block transition-colors ${highlight ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white hover:bg-gray-50'}`}>
      <div className={`text-3xl font-bold tabular-nums ${highlight ? 'text-amber-600' : ''}`}>{value.toLocaleString()}</div>
      <div className="text-sm text-gray-500 mt-1">{label} →</div>
    </Link>
  )
}

function StatPct({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  const colour = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className={`text-3xl font-bold tabular-nums ${colour}`}>{pct}%</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left font-medium">{children}</th>
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'success' ? 'bg-green-100 text-green-700' :
    status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                           'bg-red-100 text-red-700'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

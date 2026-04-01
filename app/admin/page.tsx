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
    { count: qualityCount },
    { data: allActiveOffers },
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
      .in('scraper_name', ['churningcanada', 'princeoftravel', 'mintflying'])
      .order('ran_at', { ascending: false })
      .limit(30),
    supabaseAdmin
      .from('credit_cards')
      .select('id, name, slug, short_description, referral_url')
      .eq('is_active', true),
    supabaseAdmin
      .from('card_offers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('spend_requirement', 'is', null)
      .not('details', 'is', null),
    supabaseAdmin
      .from('card_offers')
      .select('card_id, points_value, cashback_value, headline')
      .eq('is_active', true),
  ])

  // Data quality score: % of active offers with both details and spend_requirement
  const qualityPct = offerCount ? Math.round(((qualityCount ?? 0) / offerCount) * 100) : 0

  // Cards needing attention
  type ActiveCard = { id: string; name: string; slug: string; short_description: string | null; referral_url: string | null }
  type AttentionCard = { id: string; name: string; slug: string; issues: string[] }

  const offersByCard = new Map<string, { points_value: number | null; cashback_value: number | null; headline: string }[]>()
  for (const o of allActiveOffers ?? []) {
    const list = offersByCard.get(o.card_id) ?? []
    list.push(o)
    offersByCard.set(o.card_id, list)
  }

  const attentionCards: AttentionCard[] = []
  for (const card of (allActiveCards ?? []) as ActiveCard[]) {
    const issues: string[] = []
    const offers = offersByCard.get(card.id) ?? []

    if (!card.short_description) issues.push('no description')
    if (offers.length === 0) issues.push('no active offers')
    if (offers.some(o => o.headline?.includes('$undefined'))) issues.push('$undefined headline')
    if (offers.some(o => (o.points_value === 0 || o.points_value == null) && (o.cashback_value === 0 || o.cashback_value == null))) issues.push('zero-value offer')
    if (!card.referral_url) issues.push('no referral URL')

    if (issues.length > 0) attentionCards.push({ id: card.id, name: card.name, slug: card.slug, issues })
  }
  // Sort: most issues first
  attentionCards.sort((a, b) => b.issues.length - a.issues.length)

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

      {/* Cards needing attention */}
      {attentionCards.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">
            Cards Needing Attention
            <span className="ml-2 text-sm font-normal text-gray-500">({attentionCards.length})</span>
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Card</th>
                  <th className="px-4 py-2 text-left">Slug</th>
                  <th className="px-4 py-2 text-left">Issues</th>
                  <th className="px-4 py-2 text-left">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attentionCards.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{c.slug}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.issues.map(issue => (
                          <span key={issue} className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                            issue === 'no active offers' || issue === '$undefined headline' || issue === 'zero-value offer'
                              ? 'bg-red-100 text-red-700'
                              : issue === 'no description'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>{issue}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href="/admin/cards" className="text-xs text-blue-600 hover:underline">edit →</Link>
                    </td>
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

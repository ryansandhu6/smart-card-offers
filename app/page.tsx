import { supabaseAdmin } from '@/lib/supabase'
import { SOURCE_LABELS, SOURCE_NAMES } from '@/lib/sources'

export const dynamic = 'force-dynamic'

// ── Types ─────────────────────────────────────────────────────────────────────

type OfferRow = {
  id: string
  offer_type: string
  headline: string
  points_value: number | null
  cashback_value: number | null
  source_priority: number | null
  source_name: string | null
  spend_requirement: number | null
}

type CardRow = {
  id: string
  name: string
  slug: string
  rewards_type: string
  issuer: { name: string } | null
  offers: OfferRow[]
}

type DisplayRow = {
  card: CardRow
  welcome: OfferRow | null
  additional: OfferRow | null
  // best source_priority across all active offers for this card
  sourcePriority: number | null
}

// ── Query ─────────────────────────────────────────────────────────────────────
//
// SELECT credit_cards.*, issuers.name,
//        card_offers.{id,offer_type,headline,points_value,cashback_value,
//                     source_priority,source_name,spend_requirement}
// FROM credit_cards
// JOIN issuers ON credit_cards.issuer_id = issuers.id
// LEFT JOIN card_offers ON card_offers.card_id = credit_cards.id
//   AND card_offers.is_active = true
// WHERE credit_cards.is_active = true
// ORDER BY credit_cards.name ASC

async function fetchCards(): Promise<DisplayRow[]> {
  const { data, error } = await supabaseAdmin
    .from('credit_cards')
    .select(`
      id, name, slug, rewards_type,
      issuer:issuers(name),
      offers:card_offers(
        id, offer_type, headline,
        points_value, cashback_value,
        source_priority, source_name, spend_requirement
      )
    `)
    .eq('is_active', true)
    .eq('card_offers.is_active', true)
    .order('name')

  if (error) throw error

  return (data ?? []).map(raw => {
    // Supabase infers joined relations as arrays; normalise issuer
    const card = {
      ...raw,
      issuer: Array.isArray(raw.issuer) ? (raw.issuer[0] ?? null) : raw.issuer,
      offers: (raw.offers ?? []) as OfferRow[],
    } as CardRow

    const offers = card.offers

    // Bucket by offer_type
    const welcome    = bestOffer(offers.filter(o => o.offer_type !== 'additional_offer'))
    const additional = bestOffer(offers.filter(o => o.offer_type === 'additional_offer'))

    // Use source_priority from the highest-trust active offer
    const sourcePriority = offers.reduce<number | null>((best, o) => {
      if (o.source_priority == null) return best
      if (best == null || o.source_priority < best) return o.source_priority
      return best
    }, null)

    return { card, welcome, additional, sourcePriority }
  })
}

/** Pick the offer with the highest value from a set */
function bestOffer(offers: OfferRow[]): OfferRow | null {
  if (!offers.length) return null
  return offers.reduce((best, o) => {
    const bestVal = (best.points_value ?? 0) + (best.cashback_value ?? 0)
    const oVal    = (o.points_value ?? 0)    + (o.cashback_value ?? 0)
    return oVal > bestVal ? o : best
  })
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPoints(o: OfferRow | null): string {
  if (!o) return '—'
  if (o.points_value != null && o.points_value > 0)
    return `${o.points_value.toLocaleString('en-CA')} pts`
  if (o.cashback_value != null && o.cashback_value > 0)
    return `$${o.cashback_value.toLocaleString('en-CA')} CB`
  return '—'
}

function fmtTotal(welcome: OfferRow | null, additional: OfferRow | null): string {
  if (!welcome && !additional) return '—'
  const pts = (welcome?.points_value ?? 0) + (additional?.points_value ?? 0)
  const cb  = (welcome?.cashback_value ?? 0) + (additional?.cashback_value ?? 0)
  if (pts > 0 && cb > 0) return `${pts.toLocaleString('en-CA')} pts + $${cb} CB`
  if (pts > 0) return `${pts.toLocaleString('en-CA')} pts`
  if (cb > 0)  return `$${cb.toLocaleString('en-CA')} CB`
  return '—'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const rows = await fetchCards()
  const lastUpdated = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto', dateStyle: 'medium',
  })

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900">
            Canadian Credit Card Offers
          </h1>
          <p className="text-sm text-gray-500">
            {rows.length} cards · updated {lastUpdated}
          </p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Card</th>
                <th className="px-4 py-3 text-left">Issuer</th>
                <th className="px-4 py-3 text-right">Welcome Bonus</th>
                <th className="px-4 py-3 text-right">Additional Offer</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-left">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ card, welcome, additional, sourcePriority }) => (
                <tr key={card.id} className="hover:bg-gray-50">

                  {/* Card name */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{card.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{card.slug}</div>
                  </td>

                  {/* Issuer */}
                  <td className="px-4 py-3 text-gray-600">
                    {card.issuer?.name ?? '—'}
                  </td>

                  {/* Welcome Bonus */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {welcome ? (
                      <span title={welcome.headline}>{fmtPoints(welcome)}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Additional Offer */}
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {additional ? (
                      <span title={additional.headline}>{fmtPoints(additional)}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {fmtTotal(welcome, additional)}
                  </td>

                  {/* Source badge */}
                  <td className="px-4 py-3">
                    <SourceBadge priority={sourcePriority} />
                  </td>

                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No active offers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400">
          Offers sourced from ChurningCanada (CC), PrinceOfTravel (PT), and MintFlying (MF).
          Hover source badge for full name. Values are points or cash back as advertised.
        </p>
      </div>
    </main>
  )
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ priority }: { priority: number | null }) {
  const p = priority ?? 0
  const label = SOURCE_LABELS[p] ?? `p${p}`
  const title = SOURCE_NAMES[p]
  const cls =
    p === 1 ? 'bg-blue-100 text-blue-700' :
    p === 2 ? 'bg-indigo-100 text-indigo-700' :
              'bg-gray-100 text-gray-600'
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium ${cls}`}
      title={title}
    >
      {label}
    </span>
  )
}

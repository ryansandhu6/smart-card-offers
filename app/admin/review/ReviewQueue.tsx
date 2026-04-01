'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveOffer, rejectOffer } from '../actions'
import type { CardGroup, OfferRow } from './page'

export default function ReviewQueue({ groups }: { groups: CardGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map(g => (
        <CardSection key={g.card_id} group={g} />
      ))}
    </div>
  )
}

function CardSection({ group }: { group: CardGroup }) {
  const hasActive = group.active.length > 0
  return (
    <section className="bg-white rounded-lg shadow overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-3 bg-gray-50 border-b flex items-baseline gap-3">
        <span className="font-semibold">{group.card_name}</span>
        <span className="text-xs font-mono text-gray-400">{group.card_slug}</span>
        {!hasActive && (
          <span className="ml-auto text-xs text-gray-400 italic">no existing active offer</span>
        )}
      </div>

      {/* Comparison table */}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
          <tr>
            <Th>Source</Th>
            <Th>Value</Th>
            <Th>Headline</Th>
            <Th>Scraped</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Active offers first — read-only comparison rows */}
          {group.active.map(o => (
            <ActiveRow key={o.id} offer={o} />
          ))}
          {/* Pending offers — actionable */}
          {group.pending.map(o => (
            <PendingRow key={o.id} offer={o} hasActive={hasActive} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

// ── Active row (read-only, shown for comparison) ─────────────────────────────

function ActiveRow({ offer }: { offer: OfferRow }) {
  return (
    <tr className="bg-green-50 opacity-75">
      <td className="px-4 py-2.5"><SourceBadge priority={offer.source_priority} name={offer.source_name} /></td>
      <td className="px-4 py-2.5 tabular-nums text-gray-700 whitespace-nowrap">{formatValue(offer)}</td>
      <td className="px-4 py-2.5 text-gray-600 max-w-xs">{offer.headline}</td>
      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(offer.scraped_at)}</td>
      <td className="px-4 py-2.5">
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">active</span>
      </td>
      <td className="px-4 py-2.5 text-gray-400 text-xs italic">current</td>
    </tr>
  )
}

// ── Pending row (actionable) ──────────────────────────────────────────────────

function PendingRow({ offer, hasActive }: { offer: OfferRow; hasActive: boolean }) {
  const [isPending, startTrans] = useTransition()
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)
  const router = useRouter()

  function act(action: () => Promise<void>) {
    startTrans(async () => {
      await action()
      router.refresh()
    })
  }

  if (done === 'approved') {
    return (
      <tr className="bg-green-50">
        <td colSpan={6} className="px-4 py-2 text-xs text-green-700 font-medium">Activated</td>
      </tr>
    )
  }
  if (done === 'rejected') {
    return (
      <tr className="bg-red-50">
        <td colSpan={6} className="px-4 py-2 text-xs text-red-600 font-medium">Rejected</td>
      </tr>
    )
  }

  return (
    <tr className="bg-amber-50">
      <td className="px-4 py-2.5"><SourceBadge priority={offer.source_priority} name={offer.source_name} /></td>
      <td className="px-4 py-2.5 tabular-nums font-medium whitespace-nowrap">{formatValue(offer)}</td>
      <td className="px-4 py-2.5 max-w-xs">{offer.headline}</td>
      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(offer.scraped_at)}</td>
      <td className="px-4 py-2.5">
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">pending</span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => act(async () => { await approveOffer(offer.id); setDone('approved') })}
            disabled={isPending}
            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-40"
          >
            Activate
          </button>
          <button
            onClick={() => act(async () => { await rejectOffer(offer.id); setDone('rejected') })}
            disabled={isPending}
            className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 disabled:opacity-40"
          >
            Trash
          </button>
          {hasActive && (
            <button
              onClick={() => act(async () => { await rejectOffer(offer.id); setDone('rejected') })}
              disabled={isPending}
              className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 disabled:opacity-40"
            >
              Keep Existing
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left font-medium">{children}</th>
}

function SourceBadge({ priority, name }: { priority: number; name: string | null }) {
  const label = name ?? `p${priority}`
  const cls =
    priority === 1 ? 'bg-blue-100 text-blue-700' :
    priority === 2 ? 'bg-indigo-100 text-indigo-700' :
                     'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium ${cls}`}>
      {label}
    </span>
  )
}

function formatValue(o: OfferRow): string {
  if (o.points_value != null && o.points_value > 0)
    return `${o.points_value.toLocaleString('en-CA')} pts`
  if (o.cashback_value != null && o.cashback_value > 0)
    return `$${o.cashback_value} CB`
  return '—'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

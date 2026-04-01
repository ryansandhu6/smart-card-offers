'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOffer, deactivateOffer } from '../actions'
import { SOURCE_LABELS, SOURCE_NAMES } from '@/lib/sources'

type Offer = {
  id: string
  headline: string
  points_value: number | null
  cashback_value: number | null
  is_active: boolean
  offer_type: string
  source_priority: number | null
  source_name: string | null
  card: { name: string; slug: string } | null
}

export default function OffersTable({ offers }: { offers: Offer[] }) {
  const [editing, setEditing]   = useState<string | null>(null)
  const [isPending, startTrans] = useTransition()
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const router = useRouter()

  const visible = offers.filter(o => {
    if (!showInactive && !o.is_active) return false
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      o.headline?.toLowerCase().includes(q) ||
      o.card?.name?.toLowerCase().includes(q) ||
      o.source_name?.toLowerCase().includes(q)
    )
  })

  async function handleSave(
    offer: Offer,
    draft: { headline: string; points_value: number | null; cashback_value: number | null; is_active: boolean }
  ) {
    setError(null)
    startTrans(async () => {
      try {
        await updateOffer(offer.id, draft)
        router.refresh()
        setEditing(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  async function handleDeactivate(id: string) {
    setError(null)
    startTrans(async () => {
      try {
        await deactivateOffer(id)
        router.refresh()
        setEditing(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Deactivate failed')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Filter by headline, card, or source…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="h-4 w-4"
          />
          Show inactive
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Card</th>
              <th className="px-4 py-2 text-left">Headline</th>
              <th className="px-4 py-2 text-right">Points</th>
              <th className="px-4 py-2 text-right">Cash</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2 text-left">Active</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(offer =>
              editing === offer.id
                ? <EditRow
                    key={offer.id}
                    offer={offer}
                    isPending={isPending}
                    onSave={draft => handleSave(offer, draft)}
                    onCancel={() => setEditing(null)}
                  />
                : <ViewRow
                    key={offer.id}
                    offer={offer}
                    isPending={isPending}
                    onEdit={() => setEditing(offer.id)}
                    onDeactivate={() => handleDeactivate(offer.id)}
                  />
            )}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No offers found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{visible.length} shown</p>
    </div>
  )
}

// ── View row ──────────────────────────────────────────────────────────────────

function ViewRow({
  offer, isPending, onEdit, onDeactivate,
}: {
  offer: Offer
  isPending: boolean
  onEdit: () => void
  onDeactivate: () => void
}) {
  return (
    <tr className={`hover:bg-gray-50 ${!offer.is_active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-2.5">
        <div className="font-medium text-xs">{offer.card?.name ?? '—'}</div>
        <div className="text-xs text-gray-400 font-mono">{offer.card?.slug}</div>
      </td>
      <td className="px-4 py-2.5 max-w-xs">
        <div className="truncate">{offer.headline}</div>
        <div className="text-xs text-gray-400 mt-0.5">{offer.offer_type}</div>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {offer.points_value != null ? offer.points_value.toLocaleString() : '—'}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {offer.cashback_value != null ? offer.cashback_value : '—'}
      </td>
      <td className="px-4 py-2.5">
        <SourceBadge priority={offer.source_priority} />
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-block h-2 w-2 rounded-full ${offer.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
      </td>
      <td className="px-4 py-2.5 space-x-2 whitespace-nowrap">
        <button
          onClick={onEdit}
          disabled={isPending}
          className="text-xs text-blue-600 hover:underline disabled:opacity-40"
        >
          Edit
        </button>
        {offer.is_active && (
          <button
            onClick={onDeactivate}
            disabled={isPending}
            className="text-xs text-red-500 hover:underline disabled:opacity-40"
          >
            Deactivate
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Edit row ──────────────────────────────────────────────────────────────────

function EditRow({
  offer, isPending, onSave, onCancel,
}: {
  offer: Offer
  isPending: boolean
  onSave: (draft: { headline: string; points_value: number | null; cashback_value: number | null; is_active: boolean }) => void
  onCancel: () => void
}) {
  const [headline,       setHeadline]      = useState(offer.headline ?? '')
  const [points_value,   setPointsValue]   = useState(offer.points_value?.toString() ?? '')
  const [cashback_value, setCashbackValue] = useState(offer.cashback_value?.toString() ?? '')
  const [is_active,      setIsActive]      = useState(offer.is_active)

  function handleSave() {
    onSave({
      headline,
      points_value:   points_value   ? Number(points_value)   : null,
      cashback_value: cashback_value ? Number(cashback_value) : null,
      is_active,
    })
  }

  return (
    <tr className="bg-blue-50">
      <td className="px-4 py-2.5">
        <div className="text-xs font-medium">{offer.card?.name ?? '—'}</div>
        <div className="text-xs text-gray-400 font-mono">{offer.card?.slug}</div>
      </td>
      <td className="px-4 py-2.5">
        <input
          value={headline}
          onChange={e => setHeadline(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="text-xs text-gray-400 mt-0.5">{offer.offer_type}</div>
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          value={points_value}
          onChange={e => setPointsValue(e.target.value)}
          placeholder="—"
          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          step="0.01"
          value={cashback_value}
          onChange={e => setCashbackValue(e.target.value)}
          placeholder="—"
          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </td>
      <td className="px-4 py-2.5">
        <SourceBadge priority={offer.source_priority} />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="checkbox"
          checked={is_active}
          onChange={e => setIsActive(e.target.checked)}
          className="h-4 w-4"
        />
      </td>
      <td className="px-4 py-2.5 space-x-2 whitespace-nowrap">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={isPending}
          className="text-xs text-gray-500 hover:underline disabled:opacity-40"
        >
          Cancel
        </button>
      </td>
    </tr>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SourceBadge({ priority }: { priority: number | null }) {
  const p = priority ?? 0
  const label = SOURCE_LABELS[p] ?? `p${p}`
  const title = SOURCE_NAMES[p]
  const cls =
    p === 1 ? 'bg-blue-100 text-blue-700' :
    p === 2 ? 'bg-indigo-100 text-indigo-700' :
              'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium ${cls}`} title={title}>
      {label}
    </span>
  )
}

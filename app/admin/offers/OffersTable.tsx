'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOffer, updateOffer, deactivateOffer } from '../actions'
import { SOURCE_LABELS, SOURCE_NAMES } from '@/lib/sources'

const SOURCE_PRIORITY: Record<string, number> = {
  churningcanada:  1,
  princeoftravel:  2,
  mintflying:      4,
  manual:          9,
}

type Offer = {
  id: string
  headline: string
  points_value: number | null
  cashback_value: number | null
  spend_requirement: number | null
  is_active: boolean
  offer_type: string
  source_priority: number | null
  source_name: string | null
  is_limited_time: boolean
  expires_at: string | null
  card: { name: string; slug: string } | null
}

type CardOption = { id: string; name: string; slug: string }

export default function OffersTable({ offers, cards }: { offers: Offer[]; cards: CardOption[] }) {
  const [editing, setEditing]   = useState<string | null>(null)
  const [showAdd, setShowAdd]   = useState(false)
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

  async function handleCreate(draft: {
    card_id: string; headline: string; offer_type: string
    points_value: number | null; cashback_value: number | null
    spend_requirement: number | null; source_name: string; source_priority: number
    is_limited_time: boolean; expires_at: string | null
  }) {
    setError(null)
    startTrans(async () => {
      try {
        await createOffer(draft)
        router.refresh()
        setShowAdd(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Create failed')
      }
    })
  }

  async function handleSave(
    offer: Offer,
    draft: { headline: string; offer_type: string; points_value: number | null; cashback_value: number | null; spend_requirement: number | null; is_active: boolean; is_limited_time: boolean; expires_at: string | null }
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
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 whitespace-nowrap"
          >
            + Add Offer
          </button>
        )}
      </div>

      {showAdd && (
        <AddOfferForm
          cards={cards}
          isPending={isPending}
          onSave={handleCreate}
          onCancel={() => setShowAdd(false)}
        />
      )}

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
              <th className="px-4 py-2 text-left">Ltd.</th>
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
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No offers found</td></tr>
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
        <div className="text-xs text-gray-500 mt-0.5">{offer.offer_type}</div>
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
        {offer.is_limited_time && (
          <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
            {offer.expires_at ? new Date(offer.expires_at).toLocaleDateString('en-CA') : 'Ltd.'}
          </span>
        )}
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

const OFFER_TYPES = ['welcome_bonus', 'additional_offer', 'referral'] as const

function EditRow({
  offer, isPending, onSave, onCancel,
}: {
  offer: Offer
  isPending: boolean
  onSave: (draft: { headline: string; offer_type: string; points_value: number | null; cashback_value: number | null; spend_requirement: number | null; is_active: boolean; is_limited_time: boolean; expires_at: string | null }) => void
  onCancel: () => void
}) {
  const [headline,          setHeadline]         = useState(offer.headline ?? '')
  const [offer_type,        setOfferType]         = useState(offer.offer_type)
  const [points_value,      setPointsValue]       = useState(offer.points_value?.toString() ?? '')
  const [cashback_value,    setCashbackValue]     = useState(offer.cashback_value?.toString() ?? '')
  const [spend_requirement, setSpendRequirement]  = useState(offer.spend_requirement?.toString() ?? '')
  const [is_active,         setIsActive]          = useState(offer.is_active)
  const [is_limited_time,   setIsLimitedTime]     = useState(offer.is_limited_time)
  const [expires_at,        setExpiresAt]         = useState(offer.expires_at?.slice(0, 10) ?? '')

  function handleSave() {
    onSave({
      headline,
      offer_type,
      points_value:     points_value     ? Number(points_value)     : null,
      cashback_value:   cashback_value   ? Number(cashback_value)   : null,
      spend_requirement: spend_requirement ? Number(spend_requirement) : null,
      is_active,
      is_limited_time,
      expires_at: expires_at || null,
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
        <select
          value={offer_type}
          onChange={e => setOfferType(e.target.value)}
          className="mt-1 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {OFFER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
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
      <td className="px-4 py-2.5 space-y-1">
        <input
          type="number"
          step="0.01"
          value={cashback_value}
          onChange={e => setCashbackValue(e.target.value)}
          placeholder="cash —"
          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div>
          <input
            type="number"
            value={spend_requirement}
            onChange={e => setSpendRequirement(e.target.value)}
            placeholder="spend —"
            className="w-20 border border-gray-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </td>
      <td className="px-4 py-2.5">
        <SourceBadge priority={offer.source_priority} />
      </td>
      <td className="px-4 py-2.5 space-y-1">
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={is_limited_time}
            onChange={e => setIsLimitedTime(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Ltd.
        </label>
        {is_limited_time && (
          <input
            type="date"
            value={expires_at}
            onChange={e => setExpiresAt(e.target.value)}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        )}
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

// ── Add Offer form ────────────────────────────────────────────────────────────

const OFFER_TYPE_OPTIONS = ['welcome_bonus', 'additional_offer', 'referral'] as const
const SOURCE_OPTIONS = ['churningcanada', 'princeoftravel', 'mintflying', 'manual'] as const

function AddOfferForm({
  cards, isPending, onSave, onCancel,
}: {
  cards: CardOption[]
  isPending: boolean
  onSave: (draft: { card_id: string; headline: string; offer_type: string; points_value: number | null; cashback_value: number | null; spend_requirement: number | null; source_name: string; source_priority: number; is_limited_time: boolean; expires_at: string | null }) => void
  onCancel: () => void
}) {
  const [card_id,           setCardId]         = useState(cards[0]?.id ?? '')
  const [headline,          setHeadline]       = useState('')
  const [offer_type,        setOfferType]      = useState<string>('welcome_bonus')
  const [points_value,      setPointsValue]    = useState('')
  const [cashback_value,    setCashbackValue]  = useState('')
  const [spend_requirement, setSpendReq]       = useState('')
  const [source_name,       setSourceName]     = useState<string>('manual')
  const [is_limited_time,   setIsLimitedTime]  = useState(false)
  const [expires_at,        setExpiresAt]      = useState('')

  function handleSave() {
    if (!headline.trim()) return
    onSave({
      card_id,
      headline: headline.trim(),
      offer_type,
      points_value:     points_value     ? Number(points_value)     : null,
      cashback_value:   cashback_value   ? Number(cashback_value)   : null,
      spend_requirement: spend_requirement ? Number(spend_requirement) : null,
      source_name,
      source_priority: SOURCE_PRIORITY[source_name] ?? 9,
      is_limited_time,
      expires_at: expires_at || null,
    })
  }

  const inputCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium text-gray-700">New Offer</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <label className="block text-xs text-gray-500 mb-1">Card</label>
          <select value={card_id} onChange={e => setCardId(e.target.value)} className={`w-full ${inputCls}`}>
            {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Headline <span className="text-red-400">*</span></label>
          <input
            value={headline}
            onChange={e => setHeadline(e.target.value)}
            placeholder="e.g. Earn 60,000 points after spending $3,000 in 3 months"
            className={`w-full ${inputCls}`}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Offer type</label>
          <select value={offer_type} onChange={e => setOfferType(e.target.value)} className={`w-full ${inputCls}`}>
            {OFFER_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Points value</label>
          <input type="number" value={points_value} onChange={e => setPointsValue(e.target.value)} placeholder="—" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Cashback value</label>
          <input type="number" step="0.01" value={cashback_value} onChange={e => setCashbackValue(e.target.value)} placeholder="—" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Spend requirement</label>
          <input type="number" value={spend_requirement} onChange={e => setSpendReq(e.target.value)} placeholder="—" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Source</label>
          <select value={source_name} onChange={e => setSourceName(e.target.value)} className={`w-full ${inputCls}`}>
            {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <p className="text-xs text-gray-400">priority → {SOURCE_PRIORITY[source_name] ?? 9}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={is_limited_time}
              onChange={e => setIsLimitedTime(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Limited time offer
          </label>
          {is_limited_time && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expires</label>
              <input
                type="date"
                value={expires_at}
                onChange={e => setExpiresAt(e.target.value)}
                className={inputCls}
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isPending || !headline.trim()}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={isPending}
          className="text-sm text-gray-500 hover:underline disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
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

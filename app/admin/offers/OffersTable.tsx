'use client'
import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOffer, updateOffer, deleteOffer } from '../actions'
import { SOURCE_LABELS, SOURCE_NAMES } from '@/lib/sources'

const SOURCE_PRIORITY: Record<string, number> = {
  churningcanada:  1,
  princeoftravel:  2,
  mintflying:      4,
  manual:          9,
}

type Offer = {
  id: string
  card_id: string
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

type CardRow = {
  cardSlug: string
  cardName: string
  cardId: string
  welcomeOffer: Offer | null
  additionalOffer: Offer | null
  source_priority: number | null
  is_limited_time: boolean
}

type CardOption = { id: string; name: string; slug: string }

export default function OffersTable({ offers, cards }: { offers: Offer[]; cards: CardOption[] }) {
  const [editingCard, setEditingCard] = useState<string | null>(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [isPending, startTrans]       = useTransition()
  const [error, setError]             = useState<string | null>(null)
  const [filter, setFilter]           = useState('')
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

  const TYPE_ORDER: Record<string, number> = { welcome_bonus: 0, additional_offer: 1, referral: 2 }
  const grouped = new Map<string, { cardName: string; cardSlug: string; offers: Offer[] }>()
  for (const o of visible) {
    const key = o.card?.slug ?? 'unknown'
    if (!grouped.has(key)) grouped.set(key, { cardName: o.card?.name ?? '—', cardSlug: key, offers: [] })
    grouped.get(key)!.offers.push(o)
  }
  for (const g of grouped.values()) {
    g.offers.sort((a, b) => (TYPE_ORDER[a.offer_type] ?? 9) - (TYPE_ORDER[b.offer_type] ?? 9))
  }

  const cardRows: CardRow[] = [...grouped.entries()].map(([slug, g]) => {
    const welcome    = g.offers.find(o => o.offer_type === 'welcome_bonus')    ?? null
    const additional = g.offers.find(o => o.offer_type === 'additional_offer') ?? null
    const priorities = [welcome, additional].filter(Boolean).map(o => o!.source_priority ?? 9)
    const sourcePriority = priorities.length > 0 ? Math.min(...priorities) : null
    const isLtd = [welcome, additional].some(o => o?.is_limited_time)
    return { cardSlug: slug, cardName: g.cardName, cardId: g.offers[0]?.card_id ?? '', welcomeOffer: welcome, additionalOffer: additional, source_priority: sourcePriority, is_limited_time: isLtd }
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
              <th className="px-4 py-2 text-right text-blue-600">Welcome Pts</th>
              <th className="px-4 py-2 text-right text-purple-600">Additional Pts</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2 text-left">Ltd.</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cardRows.map(row => (
              <React.Fragment key={row.cardSlug}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.cardName}</div>
                    <div className="text-xs text-gray-400 font-mono">{row.cardSlug}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600 font-medium">
                    {row.welcomeOffer?.points_value != null
                      ? row.welcomeOffer.points_value.toLocaleString()
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-purple-600 font-medium">
                    {row.additionalOffer?.points_value != null
                      ? row.additionalOffer.points_value.toLocaleString()
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <SourceBadge priority={row.source_priority} />
                  </td>
                  <td className="px-4 py-3">
                    {row.is_limited_time && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                        Ltd.
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingCard(editingCard === row.cardSlug ? null : row.cardSlug)}
                        disabled={isPending}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-40"
                      >
                        {editingCard === row.cardSlug ? 'Close' : 'Edit'}
                      </button>
                      <button
                        onClick={() => {
                          if (!window.confirm(`Delete ${row.cardName} and all its offers?`)) return
                          startTrans(async () => {
                            if (row.welcomeOffer) await deleteOffer(row.welcomeOffer.id)
                            if (row.additionalOffer) await deleteOffer(row.additionalOffer.id)
                            router.refresh()
                          })
                        }}
                        disabled={isPending}
                        className="text-xs text-red-600 hover:underline disabled:opacity-40"
                      >
                        Delete Card
                      </button>
                    </div>
                  </td>
                </tr>
                {editingCard === row.cardSlug && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <CardEditPanel
                        welcomeOffer={row.welcomeOffer}
                        additionalOffer={row.additionalOffer}
                        cardId={row.cardId}
                        onDone={() => setEditingCard(null)}
                        onCancel={() => setEditingCard(null)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {cardRows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No offers found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{cardRows.length} card{cardRows.length !== 1 ? 's' : ''} shown</p>
    </div>
  )
}

// ── Card Edit Panel ───────────────────────────────────────────────────────────

function CardEditPanel({
  welcomeOffer, additionalOffer, cardId, onDone, onCancel,
}: {
  welcomeOffer: Offer | null
  additionalOffer: Offer | null
  cardId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [isPending, startTrans] = useTransition()
  const [err, setErr]           = useState<string | null>(null)
  const router = useRouter()

  const [headline,  setHeadline]  = useState(welcomeOffer?.headline ?? additionalOffer?.headline ?? '')
  const [wPoints,   setWPoints]   = useState(welcomeOffer?.points_value?.toString() ?? '')
  const [wSpend,    setWSpend]    = useState(welcomeOffer?.spend_requirement?.toString() ?? '')
  const [wLtd,      setWLtd]      = useState(welcomeOffer?.is_limited_time ?? false)
  const [wExpires,  setWExpires]  = useState(welcomeOffer?.expires_at?.slice(0, 10) ?? '')

  const [aPoints,   setAPoints]   = useState(additionalOffer?.points_value?.toString() ?? '')
  const [aSpend,    setASpend]    = useState(additionalOffer?.spend_requirement?.toString() ?? '')
  const [aLtd,      setALtd]      = useState(additionalOffer?.is_limited_time ?? false)
  const [aExpires,  setAExpires]  = useState(additionalOffer?.expires_at?.slice(0, 10) ?? '')

  function handleSave() {
    setErr(null)
    startTrans(async () => {
      try {
        // Welcome bonus: update if exists, create if headline or points filled
        if (welcomeOffer) {
          await updateOffer(welcomeOffer.id, {
            headline,
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: welcomeOffer.cashback_value,
            spend_requirement: wSpend ? Number(wSpend) : null,
            is_active: welcomeOffer.is_active,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
          })
        } else if (headline.trim() || wPoints) {
          await createOffer({
            card_id: cardId,
            headline: headline.trim(),
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: null,
            spend_requirement: wSpend ? Number(wSpend) : null,
            source_name: 'manual',
            source_priority: 9,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
            is_active: true,
            review_status: 'approved',
          })
        }

        // Additional bonus: update if exists, create if headline or points filled
        if (additionalOffer) {
          await updateOffer(additionalOffer.id, {
            headline,
            offer_type: 'additional_offer',
            points_value: aPoints ? Number(aPoints) : null,
            cashback_value: additionalOffer.cashback_value,
            spend_requirement: aSpend ? Number(aSpend) : null,
            is_active: additionalOffer.is_active,
            is_limited_time: aLtd,
            expires_at: aExpires || null,
          })
        } else if (headline.trim() || aPoints) {
          await createOffer({
            card_id: cardId,
            headline: headline.trim(),
            offer_type: 'additional_offer',
            points_value: aPoints ? Number(aPoints) : null,
            cashback_value: null,
            spend_requirement: aSpend ? Number(aSpend) : null,
            source_name: 'manual',
            source_priority: 9,
            is_limited_time: aLtd,
            expires_at: aExpires || null,
            is_active: true,
            review_status: 'approved',
          })
        }

        router.refresh()
        onDone()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="px-5 py-4 bg-blue-50 border-t border-b border-blue-100">
      <div className="mb-4">
        <label className={labelCls}>Headline <span className="text-gray-400 font-normal normal-case">(shared for both bonuses)</span></label>
        <input value={headline} onChange={e => setHeadline(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        {/* Welcome Bonus */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide border-b border-blue-200 pb-1">
            Welcome Bonus {!welcomeOffer && <span className="font-normal text-blue-400 normal-case">(new)</span>}
          </h4>
          <div>
            <label className={labelCls}>Points</label>
            <input type="number" value={wPoints} onChange={e => setWPoints(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Spend Req ($)</label>
            <input type="number" value={wSpend} onChange={e => setWSpend(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={wLtd} onChange={e => setWLtd(e.target.checked)} className="h-3.5 w-3.5" />
            Limited time
          </label>
          {wLtd && <input type="date" value={wExpires} onChange={e => setWExpires(e.target.value)} className={inputCls} />}
          {welcomeOffer && (
            <button
              onClick={() => {
                if (!window.confirm(`Delete welcome bonus offer for ${welcomeOffer.card?.name ?? 'this card'}?`)) return
                startTrans(async () => { await deleteOffer(welcomeOffer.id); router.refresh(); onDone() })
              }}
              disabled={isPending}
              className="text-xs text-red-500 hover:underline disabled:opacity-40 pt-1 block"
            >
              Delete
            </button>
          )}
        </div>

        {/* Additional Bonus */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide border-b border-purple-200 pb-1">
            Additional Bonus {!additionalOffer && <span className="font-normal text-purple-400 normal-case">(new)</span>}
          </h4>
          <div>
            <label className={labelCls}>Points</label>
            <input type="number" value={aPoints} onChange={e => setAPoints(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Spend Req ($)</label>
            <input type="number" value={aSpend} onChange={e => setASpend(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={aLtd} onChange={e => setALtd(e.target.checked)} className="h-3.5 w-3.5" />
            Limited time
          </label>
          {aLtd && <input type="date" value={aExpires} onChange={e => setAExpires(e.target.value)} className={inputCls} />}
          {additionalOffer && (
            <button
              onClick={() => {
                if (!window.confirm(`Delete additional bonus offer for ${additionalOffer.card?.name ?? 'this card'}?`)) return
                startTrans(async () => { await deleteOffer(additionalOffer.id); router.refresh(); onDone() })
              }}
              disabled={isPending}
              className="text-xs text-red-500 hover:underline disabled:opacity-40 pt-1 block"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={isPending}
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
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
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

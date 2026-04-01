'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveOffer, rejectOffer, updateOffer, updateCard, createOffer } from '../actions'
import { SOURCE_LABELS, SOURCE_NAMES } from '@/lib/sources'
import type { CardGroup, OfferRow } from './page'

const TIERS = ['no-fee', 'entry', 'mid', 'premium', 'super-premium'] as const
const OFFER_TYPES = ['welcome_bonus', 'additional_offer', 'referral'] as const

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
  const [showEdit, setShowEdit] = useState(false)
  const [isPending, startTrans] = useTransition()
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const router = useRouter()

  // Card edit state
  const [cardName,     setCardName]     = useState(group.card_name)
  const [cardTier,     setCardTier]     = useState(group.card_tier)
  const [annualFee,    setAnnualFee]    = useState(group.card_annual_fee?.toString() ?? '0')
  const [fyf,          setFyf]          = useState(group.card_annual_fee_waived)
  const [description,  setDescription]  = useState(group.card_description ?? '')
  const [referralUrl,  setReferralUrl]  = useState(group.card_referral_url ?? '')
  const [imageUrl,     setImageUrl]     = useState(group.card_image_url ?? '')

  function handleSaveCard() {
    setSaveErr(null)
    setSavedOk(false)
    startTrans(async () => {
      try {
        await updateCard(group.card_id, {
          name: cardName,
          tier: cardTier,
          is_active: group.card_is_active,
          annual_fee: annualFee ? Number(annualFee) : 0,
          annual_fee_waived_first_year: fyf,
          short_description: description.trim() || null,
          referral_url: referralUrl.trim() || null,
          image_url: imageUrl.trim() || null,
        })
        setSavedOk(true)
        router.refresh()
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  const feeLabel = (group.card_annual_fee ?? 0) === 0
    ? 'No Fee'
    : `$${group.card_annual_fee}/yr`

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'

  return (
    <section className="bg-white rounded-lg shadow overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-3 bg-gray-50 border-b flex items-center gap-3 flex-wrap">
        <span className="font-semibold">{group.card_name}</span>
        <span className="text-xs font-mono text-gray-400">{group.card_slug}</span>
        <TierBadge tier={group.card_tier} />
        <span className="text-xs text-gray-500">{feeLabel}</span>
        {group.card_annual_fee_waived && (
          <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">FYF</span>
        )}
        {!hasActive && (
          <span className="ml-auto text-xs text-gray-400 italic">no existing active offer</span>
        )}
        <button
          onClick={() => { setShowEdit(v => !v); setSavedOk(false); setSaveErr(null) }}
          className="ml-auto text-xs text-blue-600 hover:underline"
        >
          {showEdit ? 'Hide ▴' : 'Edit Card Details ▾'}
        </button>
      </div>

      {/* Collapsible card edit panel */}
      {showEdit && (
        <div className="px-5 py-4 bg-blue-50 border-b space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input value={cardName} onChange={e => setCardName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tier</label>
              <select value={cardTier} onChange={e => setCardTier(e.target.value)} className={inputCls}>
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Annual Fee $</label>
              <input type="number" value={annualFee} onChange={e => setAnnualFee(e.target.value)} className={inputCls} />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id={`fyf-${group.card_id}`}
                checked={fyf}
                onChange={e => setFyf(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor={`fyf-${group.card_id}`} className="text-sm text-gray-700 cursor-pointer">First Year Free (FYF)</label>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Referral URL</label>
              <input type="url" value={referralUrl} onChange={e => setReferralUrl(e.target.value)} placeholder="https://…" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Image URL</label>
              <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" className={inputCls} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveCard}
              disabled={isPending}
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40"
            >
              {isPending ? 'Saving…' : 'Save Card'}
            </button>
            {savedOk && <span className="text-xs text-green-600">Saved</span>}
            {saveErr && <span className="text-xs text-red-600">{saveErr}</span>}
          </div>
        </div>
      )}

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
      <AddOfferPanel cardId={group.card_id} />
    </section>
  )
}

// ── Add Offer panel ───────────────────────────────────────────────────────────

function AddOfferPanel({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTrans] = useTransition()
  const [savedOk, setSavedOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  // Welcome bonus fields
  const [wHeadline, setWHeadline] = useState('')
  const [wPoints, setWPoints] = useState('')
  const [wCash, setWCash] = useState('')
  const [wSpend, setWSpend] = useState('')
  const [wLtd, setWLtd] = useState(false)
  const [wExpires, setWExpires] = useState('')

  // Additional bonus fields
  const [aHeadline, setAHeadline] = useState('')
  const [aPoints, setAPoints] = useState('')
  const [aCash, setACash] = useState('')
  const [aSpend, setASpend] = useState('')
  const [aLtd, setALtd] = useState(false)
  const [aExpires, setAExpires] = useState('')

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'

  function handleSave() {
    setErr(null)
    setSavedOk(false)
    startTrans(async () => {
      try {
        // Save welcome bonus if headline filled
        if (wHeadline.trim()) {
          await createOffer({
            card_id: cardId,
            headline: wHeadline.trim(),
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: wCash ? Number(wCash) : null,
            spend_requirement: wSpend ? Number(wSpend) : null,
            source_name: 'manual',
            source_priority: 9,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
            is_active: false,
            review_status: 'pending_review',
          })
        }
        // Save additional bonus if headline filled
        if (aHeadline.trim()) {
          await createOffer({
            card_id: cardId,
            headline: aHeadline.trim(),
            offer_type: 'additional_offer',
            points_value: aPoints ? Number(aPoints) : null,
            cashback_value: aCash ? Number(aCash) : null,
            spend_requirement: aSpend ? Number(aSpend) : null,
            source_name: 'manual',
            source_priority: 9,
            is_limited_time: aLtd,
            expires_at: aExpires || null,
            is_active: false,
            review_status: 'pending_review',
          })
        }
        setSavedOk(true)
        setOpen(false)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  return (
    <div className="border-t border-gray-100">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setSavedOk(false) }}
          className="w-full py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
        >
          + Add Offer
        </button>
      ) : (
        <div className="px-5 py-4 bg-gray-50 space-y-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Welcome Bonus */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Welcome Bonus</h4>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Headline</label>
                <input value={wHeadline} onChange={e => setWHeadline(e.target.value)} placeholder="e.g. Earn 60,000 points..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points</label>
                  <input type="number" value={wPoints} onChange={e => setWPoints(e.target.value)} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cash ($)</label>
                  <input type="number" step="0.01" value={wCash} onChange={e => setWCash(e.target.value)} placeholder="0.00" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Spend Req ($)</label>
                <input type="number" value={wSpend} onChange={e => setWSpend(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={wLtd} onChange={e => setWLtd(e.target.checked)} className="h-3.5 w-3.5" />
                Limited time
              </label>
              {wLtd && <input type="date" value={wExpires} onChange={e => setWExpires(e.target.value)} className={inputCls} />}
            </div>

            {/* Additional Bonus */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Additional Bonus</h4>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Headline</label>
                <input value={aHeadline} onChange={e => setAHeadline(e.target.value)} placeholder="e.g. Plus earn 15,000 more..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points</label>
                  <input type="number" value={aPoints} onChange={e => setAPoints(e.target.value)} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cash ($)</label>
                  <input type="number" step="0.01" value={aCash} onChange={e => setACash(e.target.value)} placeholder="0.00" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Spend Req ($)</label>
                <input type="number" value={aSpend} onChange={e => setASpend(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={aLtd} onChange={e => setALtd(e.target.checked)} className="h-3.5 w-3.5" />
                Limited time
              </label>
              {aLtd && <input type="date" value={aExpires} onChange={e => setAExpires(e.target.value)} className={inputCls} />}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={isPending || (!wHeadline.trim() && !aHeadline.trim())}
              className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-40"
            >
              {isPending ? 'Saving…' : 'Save Offers'}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="text-sm text-gray-500 hover:underline disabled:opacity-40"
            >
              Cancel
            </button>
            {savedOk && <span className="text-xs text-green-600">Saved</span>}
            {err && <span className="text-xs text-red-600">{err}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Active row (read-only, shown for comparison) ─────────────────────────────

function ActiveRow({ offer }: { offer: OfferRow }) {
  return (
    <tr className="bg-green-50 opacity-75">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SourceBadge priority={offer.source_priority} />
          <span className="text-xs text-gray-400 font-mono">{offer.offer_type}</span>
        </div>
      </td>
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

// ── Pending row (actionable + inline-editable) ────────────────────────────────

function PendingRow({ offer, hasActive }: { offer: OfferRow; hasActive: boolean }) {
  const [isPending, startTrans] = useTransition()
  const [done, setDone]              = useState<'approved' | 'rejected' | null>(null)
  const [editing, setEditing]        = useState(false)
  const [headline, setHeadline]      = useState(offer.headline)
  const [points, setPoints]          = useState(offer.points_value?.toString() ?? '')
  const [cash, setCash]              = useState(offer.cashback_value?.toString() ?? '')
  const [offerType, setOfferType]    = useState(offer.offer_type)
  const [spendReq, setSpendReq]      = useState(offer.spend_requirement?.toString() ?? '')
  const [isLtd, setIsLtd]            = useState(offer.is_limited_time)
  const [expiresAt, setExpiresAt]    = useState(offer.expires_at?.slice(0, 10) ?? '')
  const router = useRouter()

  function act(action: () => Promise<void>) {
    startTrans(async () => {
      await action()
      router.refresh()
    })
  }

  function handleSaveChanges() {
    act(async () => {
      await updateOffer(offer.id, {
        headline,
        offer_type: offerType,
        points_value: points ? Number(points) : null,
        cashback_value: cash ? Number(cash) : null,
        spend_requirement: spendReq ? Number(spendReq) : null,
        is_active: offer.is_active,
        is_limited_time: isLtd,
        expires_at: expiresAt || null,
      })
      setEditing(false)
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
      <td className="px-4 py-2.5">
        {editing ? (
          <select
            value={offerType}
            onChange={e => setOfferType(e.target.value)}
            className="border border-amber-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            {OFFER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <SourceBadge priority={offer.source_priority} />
            <span className="text-xs text-gray-500 font-mono">{offer.offer_type}</span>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 tabular-nums font-medium whitespace-nowrap">
        {editing ? (
          <div className="space-y-1">
            <input
              type="number"
              value={points}
              onChange={e => setPoints(e.target.value)}
              placeholder="pts"
              className="w-24 border border-amber-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <input
              type="number"
              step="0.01"
              value={cash}
              onChange={e => setCash(e.target.value)}
              placeholder="cash"
              className="w-24 border border-amber-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        ) : formatValue(offer)}
      </td>
      <td className="px-4 py-2.5 max-w-xs">
        {editing ? (
          <div className="space-y-1">
            <input
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              className="w-full border border-amber-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <input
              type="number"
              value={spendReq}
              onChange={e => setSpendReq(e.target.value)}
              placeholder="spend req $"
              className="w-28 border border-amber-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isLtd}
                onChange={e => setIsLtd(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Limited time
            </label>
            {isLtd && (
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="border border-amber-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            )}
          </div>
        ) : offer.headline}
      </td>
      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(offer.scraped_at)}</td>
      <td className="px-4 py-2.5">
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">pending</span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {editing ? (
            <>
              <button
                onClick={handleSaveChanges}
                disabled={isPending}
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-40"
              >
                {isPending ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={isPending}
                className="text-xs text-gray-500 hover:underline disabled:opacity-40"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                disabled={isPending}
                className="text-xs text-blue-600 hover:underline disabled:opacity-40"
              >
                Edit
              </button>
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
            </>
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

function SourceBadge({ priority }: { priority: number }) {
  const label = SOURCE_LABELS[priority] ?? `p${priority}`
  const title = SOURCE_NAMES[priority]
  const cls =
    priority === 1 ? 'bg-blue-100 text-blue-700' :
    priority === 2 ? 'bg-indigo-100 text-indigo-700' :
                     'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium ${cls}`} title={title}>
      {label}
    </span>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const colours: Record<string, string> = {
    'no-fee':        'bg-gray-100 text-gray-600',
    'entry':         'bg-blue-50 text-blue-600',
    'mid':           'bg-indigo-50 text-indigo-600',
    'premium':       'bg-purple-50 text-purple-700',
    'super-premium': 'bg-amber-50 text-amber-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colours[tier] ?? 'bg-gray-100 text-gray-600'}`}>
      {tier}
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

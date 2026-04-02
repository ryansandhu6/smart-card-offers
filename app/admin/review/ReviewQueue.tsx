'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveOffer, rejectOffer, updateOffer, updateCard, createOffer, deleteCard, deleteOffer } from '../actions'
import { SOURCE_LABELS, SOURCE_NAMES } from '@/lib/sources'
import type { CardGroup, OfferRow } from './page'

const TIERS = ['no-fee', 'entry', 'mid', 'premium', 'super-premium'] as const

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
  const [showEdit,       setShowEdit]       = useState(false)
  const [showEditOffers, setShowEditOffers] = useState(false)
  const [isPending,      startTrans]        = useTransition()
  const [saveErr,        setSaveErr]        = useState<string | null>(null)
  const [savedOk,        setSavedOk]        = useState(false)
  const router = useRouter()

  // Card edit state
  const [cardName,    setCardName]    = useState(group.card_name)
  const [cardTier,    setCardTier]    = useState(group.card_tier)
  const [annualFee,   setAnnualFee]   = useState(group.card_annual_fee?.toString() ?? '0')
  const [fyf,         setFyf]         = useState(group.card_annual_fee_waived)
  const [description, setDescription] = useState(group.card_description ?? '')
  const [referralUrl, setReferralUrl] = useState(group.card_referral_url ?? '')
  const [imageUrl,    setImageUrl]    = useState(group.card_image_url ?? '')

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

  const ORDER: Record<string, number> = { welcome_bonus: 0, additional_offer: 1, referral: 2 }
  const sortedPending = [...group.pending].sort((a, b) => (ORDER[a.offer_type] ?? 9) - (ORDER[b.offer_type] ?? 9))
  const sortedActive  = [...group.active ].sort((a, b) => (ORDER[a.offer_type] ?? 9) - (ORDER[b.offer_type] ?? 9))

  const welcomePending    = sortedPending.find(o => o.offer_type === 'welcome_bonus')
  const additionalPending = sortedPending.find(o => o.offer_type === 'additional_offer')
  const welcomeActive     = sortedActive.find(o => o.offer_type === 'welcome_bonus')
  const additionalActive  = sortedActive.find(o => o.offer_type === 'additional_offer')

  const pendingIsLtd = [welcomePending, additionalPending].some(o => o?.is_limited_time)
  const activeIsLtd  = [welcomeActive,  additionalActive ].some(o => o?.is_limited_time)

  function activateAll() {
    startTrans(async () => {
      await Promise.all(sortedPending.map(o => approveOffer(o.id)))
      router.refresh()
    })
  }

  function trashAll() {
    startTrans(async () => {
      await Promise.all(sortedPending.map(o => rejectOffer(o.id)))
      router.refresh()
    })
  }

  function handleDeleteCard() {
    if (!window.confirm(`Delete ${group.card_name} and all its offers? Cannot be undone.`)) return
    startTrans(async () => {
      await deleteCard(group.card_id)
      router.refresh()
    })
  }

  const feeLabel = (group.card_annual_fee ?? 0) === 0 ? 'No Fee' : `$${group.card_annual_fee}/yr`
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
        <button
          onClick={handleDeleteCard}
          disabled={isPending}
          className="ml-auto text-xs text-red-600 hover:underline disabled:opacity-40"
        >
          Delete Card
        </button>
        <button
          onClick={() => { setShowEdit(v => !v); setSavedOk(false); setSaveErr(null) }}
          className="text-xs text-blue-600 hover:underline"
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
            {savedOk  && <span className="text-xs text-green-600">Saved</span>}
            {saveErr  && <span className="text-xs text-red-600">{saveErr}</span>}
          </div>
        </div>
      )}

      {/* Offer summary table */}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
          <tr>
            <Th>Source</Th>
            <Th>Welcome Pts</Th>
            <Th>Additional Pts</Th>
            <Th>Headline</Th>
            <Th>Ltd.</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Active summary row — read-only comparison */}
          {(welcomeActive || additionalActive) && (
            <tr className="bg-green-50 opacity-80">
              <td className="px-4 py-2.5">
                <SourceBadge priority={Math.min(
                  ...[welcomeActive, additionalActive].filter(Boolean).map(o => o!.source_priority)
                )} />
              </td>
              <td className="px-4 py-2.5 tabular-nums text-blue-600 font-medium">
                {welcomeActive?.points_value?.toLocaleString('en-CA') ?? <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-purple-600 font-medium">
                {additionalActive?.points_value?.toLocaleString('en-CA') ?? <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                {welcomeActive?.headline ?? additionalActive?.headline ?? '—'}
              </td>
              <td className="px-4 py-2.5">
                {activeIsLtd && <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Ltd.</span>}
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">active</span>
              </td>
              <td className="px-4 py-2.5 text-gray-400 text-xs italic">current</td>
            </tr>
          )}

          {/* Pending summary row */}
          {(welcomePending || additionalPending) && (() => {
            const typeCounts = sortedPending.reduce((acc, o) => {
              acc[o.offer_type] = (acc[o.offer_type] ?? 0) + 1
              return acc
            }, {} as Record<string, number>)
            const hasDuplicates = Object.values(typeCounts).some(c => c > 1)
            return (
            <tr className="bg-amber-50">
              <td className="px-4 py-2.5">
                <SourceBadge priority={Math.min(
                  ...[welcomePending, additionalPending].filter(Boolean).map(o => o!.source_priority)
                )} />
                {hasDuplicates && (
                  <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Duplicate</span>
                )}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-blue-600 font-medium">
                {welcomePending?.points_value?.toLocaleString('en-CA') ?? <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-purple-600 font-medium">
                {additionalPending?.points_value?.toLocaleString('en-CA') ?? <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">
                {welcomePending?.headline ?? additionalPending?.headline ?? '—'}
              </td>
              <td className="px-4 py-2.5">
                {pendingIsLtd && <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Ltd.</span>}
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">pending</span>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowEditOffers(v => !v)}
                    disabled={isPending}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-40"
                  >
                    {showEditOffers ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={activateAll}
                    disabled={isPending}
                    className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-40"
                  >
                    Activate
                  </button>
                  <button
                    onClick={trashAll}
                    disabled={isPending}
                    className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 disabled:opacity-40"
                  >
                    Trash
                  </button>
                  {welcomePending && (
                    <button
                      onClick={() => {
                        if (!window.confirm('Permanently delete this offer?')) return
                        startTrans(async () => { await deleteOffer(welcomePending.id); router.refresh() })
                      }}
                      disabled={isPending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-40"
                    >
                      Del W
                    </button>
                  )}
                  {additionalPending && (
                    <button
                      onClick={() => {
                        if (!window.confirm('Permanently delete this offer?')) return
                        startTrans(async () => { await deleteOffer(additionalPending.id); router.refresh() })
                      }}
                      disabled={isPending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-40"
                    >
                      Del A
                    </button>
                  )}
                </div>
              </td>
            </tr>
            )
          })()}

          {/* Inline offer edit panel */}
          {showEditOffers && (
            <tr>
              <td colSpan={7} className="p-0">
                <ReviewOfferEditPanel
                  welcomeOffer={welcomePending ?? null}
                  additionalOffer={additionalPending ?? null}
                  cardId={group.card_id}
                  onDone={() => setShowEditOffers(false)}
                  onCancel={() => setShowEditOffers(false)}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <AddOfferPanel cardId={group.card_id} />
    </section>
  )
}

// ── Inline offer edit panel ───────────────────────────────────────────────────

function ReviewOfferEditPanel({
  welcomeOffer, additionalOffer, cardId, onDone, onCancel,
}: {
  welcomeOffer: OfferRow | null
  additionalOffer: OfferRow | null
  cardId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [isPending, startTrans] = useTransition()
  const [err, setErr]           = useState<string | null>(null)
  const router = useRouter()

  const [wHeadline, setWHeadline] = useState(welcomeOffer?.headline ?? '')
  const [wPoints,   setWPoints]   = useState(welcomeOffer?.points_value?.toString() ?? '')
  const [wSpend,    setWSpend]    = useState(welcomeOffer?.spend_requirement?.toString() ?? '')
  const [wLtd,      setWLtd]      = useState(welcomeOffer?.is_limited_time ?? false)
  const [wExpires,  setWExpires]  = useState(welcomeOffer?.expires_at?.slice(0, 10) ?? '')

  const [aHeadline, setAHeadline] = useState(additionalOffer?.headline ?? '')
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
            headline: wHeadline,
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: welcomeOffer.cashback_value,
            spend_requirement: wSpend ? Number(wSpend) : null,
            is_active: welcomeOffer.is_active,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
          })
        } else if (wHeadline.trim() || wPoints) {
          await createOffer({
            card_id: cardId,
            headline: wHeadline.trim(),
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: null,
            spend_requirement: wSpend ? Number(wSpend) : null,
            source_name: 'manual',
            source_priority: 9,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
            is_active: false,
            review_status: 'pending_review',
          })
        }

        // Additional bonus: update if exists, create if headline or points filled
        if (additionalOffer) {
          await updateOffer(additionalOffer.id, {
            headline: aHeadline,
            offer_type: 'additional_offer',
            points_value: aPoints ? Number(aPoints) : null,
            cashback_value: additionalOffer.cashback_value,
            spend_requirement: aSpend ? Number(aSpend) : null,
            is_active: additionalOffer.is_active,
            is_limited_time: aLtd,
            expires_at: aExpires || null,
          })
        } else if (aHeadline.trim() || aPoints) {
          await createOffer({
            card_id: cardId,
            headline: aHeadline.trim(),
            offer_type: 'additional_offer',
            points_value: aPoints ? Number(aPoints) : null,
            cashback_value: null,
            spend_requirement: aSpend ? Number(aSpend) : null,
            source_name: 'manual',
            source_priority: 9,
            is_limited_time: aLtd,
            expires_at: aExpires || null,
            is_active: false,
            review_status: 'pending_review',
          })
        }

        router.refresh()
        onDone()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 w-full'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="px-5 py-4 bg-amber-50 border-t border-amber-100">
      <div className="grid grid-cols-2 gap-6">
        {/* Welcome Bonus */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide border-b border-blue-200 pb-1">
            Welcome Bonus {!welcomeOffer && <span className="font-normal text-blue-400 normal-case">(new)</span>}
          </h4>
          <div>
            <label className={labelCls}>Headline</label>
            <input value={wHeadline} onChange={e => setWHeadline(e.target.value)} className={inputCls} />
          </div>
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
        </div>

        {/* Additional Bonus */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide border-b border-purple-200 pb-1">
            Additional Bonus {!additionalOffer && <span className="font-normal text-purple-400 normal-case">(new)</span>}
          </h4>
          <div>
            <label className={labelCls}>Headline</label>
            <input value={aHeadline} onChange={e => setAHeadline(e.target.value)} className={inputCls} />
          </div>
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
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {isPending ? 'Saving…' : 'Save Changes'}
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

// ── Add Offer panel ───────────────────────────────────────────────────────────

function AddOfferPanel({ cardId }: { cardId: string }) {
  const [open, setOpen]           = useState(false)
  const [isPending, startTrans]   = useTransition()
  const [savedOk, setSavedOk]     = useState(false)
  const [err, setErr]             = useState<string | null>(null)
  const router = useRouter()

  // Shared headline
  const [headline, setHeadline] = useState('')

  // Welcome bonus fields
  const [wPoints,  setWPoints]  = useState('')
  const [wCash,    setWCash]    = useState('')
  const [wSpend,   setWSpend]   = useState('')
  const [wLtd,     setWLtd]     = useState(false)
  const [wExpires, setWExpires] = useState('')

  // Additional bonus fields
  const [aPoints,  setAPoints]  = useState('')
  const [aCash,    setACash]    = useState('')
  const [aSpend,   setASpend]   = useState('')
  const [aLtd,     setALtd]     = useState(false)
  const [aExpires, setAExpires] = useState('')

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'

  function handleSave() {
    setErr(null)
    setSavedOk(false)
    startTrans(async () => {
      try {
        // Save welcome bonus if headline filled
        if (headline.trim()) {
          await createOffer({
            card_id: cardId,
            headline: headline.trim(),
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
        // Save additional bonus alongside welcome bonus
        if (headline.trim()) {
          await createOffer({
            card_id: cardId,
            headline: headline.trim(),
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
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">
              Headline <span className="text-gray-400">(shared for both bonuses)</span>
            </label>
            <input
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              placeholder="e.g. Earn 60,000 pts welcome + 15,000 additional on $3,000 spend"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            {/* Welcome Bonus */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Welcome Bonus</h4>
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
              disabled={isPending || !headline.trim()}
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
            {err     && <span className="text-xs text-red-600">{err}</span>}
          </div>
        </div>
      )}
    </div>
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

'use client'
import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveOffer, rejectOffer, updateOffer, updateCard, createOffer, deleteCard, deleteOffer, setCardNoBonus, mergeCard, getCardActiveOffers, mergeCardWithOfferSelection } from '../actions'
import { SOURCE_LABELS, SOURCE_NAMES } from '@/lib/sources'
import type { CardGroup, OfferRow, ActiveCardOption } from './page'

const TIERS = ['no-fee', 'entry', 'mid', 'premium', 'super-premium'] as const

type TargetOffer = {
  id: string
  offer_type: string
  headline: string
  points_value: number | null
  cashback_value: number | null
}

type ReviewAdditionalDraft = {
  id: string | undefined
  headline: string
  points: string
  cash: string
  spend: string
  timeframeDays: string
  startMonth: string
  ltd: boolean
  expires: string
  is_active: boolean
  isMonthly: boolean
  monthlyPoints: string
  monthlyCash: string
  monthlySpend: string
  bonusMonths: string
}

export default function ReviewQueue({ groups, allCards }: { groups: CardGroup[], allCards: ActiveCardOption[] }) {
  return (
    <div className="space-y-6">
      {groups.map(g => (
        <CardSection key={g.card_id} group={g} allCards={allCards} />
      ))}
    </div>
  )
}

function CardSection({ group, allCards }: { group: CardGroup, allCards: ActiveCardOption[] }) {
  const [showEdit,          setShowEdit]          = useState(false)
  const [showEditOffers,    setShowEditOffers]    = useState(false)
  const [showCurrentDetail, setShowCurrentDetail] = useState(false)
  const [showMerge,         setShowMerge]         = useState(false)
  const [mergeTargetId,    setMergeTargetId]    = useState('')
  const [mergeErr,         setMergeErr]         = useState<string | null>(null)
  const [isPending,        startTrans]          = useTransition()
  const [saveErr,          setSaveErr]          = useState<string | null>(null)
  const [savedOk,          setSavedOk]          = useState(false)
  const [targetOffers,     setTargetOffers]     = useState<TargetOffer[] | null>(null)
  const [isFetchingTarget, setIsFetchingTarget] = useState(false)
  const [offerSelections,  setOfferSelections]  = useState<Record<string, string>>({})
  const router = useRouter()

  const otherCards = allCards.filter(c => c.id !== group.card_id)

  async function handleTargetChange(newId: string) {
    setMergeTargetId(newId)
    setTargetOffers(null)
    setOfferSelections({})
    if (!newId) return
    setIsFetchingTarget(true)
    try {
      const offers = await getCardActiveOffers(newId)
      setTargetOffers(offers)
      // Default selections: prefer stub's pending offer per type, fall back to target's
      const types = [...new Set([...sortedPending.map(o => o.offer_type), ...offers.map(o => o.offer_type)])]
      const init: Record<string, string> = {}
      for (const t of types) {
        const pending = sortedPending.find(o => o.offer_type === t)
        const target  = offers.find(o => o.offer_type === t)
        if (pending) init[t] = pending.id
        else if (target) init[t] = target.id
      }
      setOfferSelections(init)
    } catch {
      setMergeErr('Failed to load target card offers')
    } finally {
      setIsFetchingTarget(false)
    }
  }

  function handleMerge() {
    if (!mergeTargetId) return
    const target = otherCards.find(c => c.id === mergeTargetId)
    const targetName = target?.name ?? 'target card'
    if (!window.confirm(
      `Stub card "${group.card_name}" will be deleted.\n` +
      `You're choosing which offers stay active on "${targetName}".`
    )) return
    setMergeErr(null)
    startTrans(async () => {
      try {
        await mergeCardWithOfferSelection(group.card_id, mergeTargetId, Object.values(offerSelections))
        router.refresh()
      } catch (e) {
        setMergeErr(e instanceof Error ? e.message : 'Merge failed')
      }
    })
  }

  // Card edit state
  const [cardName,    setCardName]    = useState(group.card_name)
  const [cardTier,    setCardTier]    = useState(group.card_tier)
  const [annualFee,   setAnnualFee]   = useState(group.card_annual_fee?.toString() ?? '0')
  const [fyf,         setFyf]         = useState(group.card_annual_fee_waived)
  const [description, setDescription] = useState(group.card_description ?? '')
  const [referralUrl, setReferralUrl] = useState(group.card_referral_url ?? '')
  const [imageUrl,    setImageUrl]    = useState(group.card_image_url ?? '')
  const [fxFee,       setFxFee]       = useState(group.card_foreign_transaction_fee?.toString() ?? '')
  const [minIncome,   setMinIncome]   = useState(group.card_min_income?.toString() ?? '')
  const [minHousehold, setMinHousehold] = useState(group.card_min_household_income?.toString() ?? '')

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
          foreign_transaction_fee: fxFee !== '' ? Number(fxFee) : null,
          min_income: minIncome !== '' ? Number(minIncome) : null,
          minimum_household_income: minHousehold !== '' ? Number(minHousehold) : null,
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
  const additionalPending = sortedPending.filter(o => o.offer_type === 'additional_offer')
  const welcomeActive     = sortedActive.find(o => o.offer_type === 'welcome_bonus')
  const additionalActive  = sortedActive.filter(o => o.offer_type === 'additional_offer')

  const pendingIsLtd = [welcomePending, ...additionalPending].some(o => o?.is_limited_time)
  const activeIsLtd  = [welcomeActive,  ...additionalActive ].some(o => o?.is_limited_time)

  const pendingCash = [welcomePending, ...additionalPending]
    .map(o => o?.cashback_value).filter((v): v is number => v != null)
  const pendingCashValue = pendingCash.length > 0 ? Math.max(...pendingCash) : null

  const activeCash = [welcomeActive, ...additionalActive]
    .map(o => o?.cashback_value).filter((v): v is number => v != null)
  const activeCashValue = activeCash.length > 0 ? Math.max(...activeCash) : null

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
    <section id={`card-${group.card_slug}`} className="bg-white rounded-lg shadow overflow-hidden">
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
          onClick={() => { setShowMerge(v => !v); setMergeErr(null) }}
          className="text-xs text-orange-600 hover:underline"
        >
          {showMerge ? 'Cancel merge ▴' : 'Link to card ▾'}
        </button>
        <button
          onClick={() => { setShowEdit(v => !v); setSavedOk(false); setSaveErr(null) }}
          className="text-xs text-blue-600 hover:underline"
        >
          {showEdit ? 'Hide ▴' : 'Edit Card Details ▾'}
        </button>
      </div>

      {/* Merge panel */}
      {showMerge && (
        <div className="px-5 py-4 bg-orange-50 border-b space-y-3">
          <p className="text-xs text-orange-700 font-medium">
            Move all offers from this card to an existing card, then delete this card.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={mergeTargetId}
              onChange={e => { setMergeErr(null); handleTargetChange(e.target.value) }}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">— select target card —</option>
              {otherCards.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>
              ))}
            </select>
            {isFetchingTarget && <span className="text-xs text-gray-400">Loading…</span>}
          </div>

          {/* Offer comparison table */}
          {targetOffers != null && mergeTargetId && (() => {
            const targetCard = otherCards.find(c => c.id === mergeTargetId)
            const offerTypes = [...new Set([
              ...sortedPending.map(o => o.offer_type),
              ...targetOffers.map(o => o.offer_type),
            ])]
            return (
              <div className="space-y-2">
                <p className="text-xs text-orange-600">
                  For each offer type, choose which offer to keep active on <strong>{targetCard?.name}</strong>:
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border border-orange-200 rounded">
                    <thead className="bg-orange-100 text-orange-800">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Type</th>
                        <th className="px-3 py-1.5 text-left font-medium">Stub (pending)</th>
                        <th className="px-3 py-1.5 text-left font-medium">Target (active)</th>
                        <th className="px-3 py-1.5 text-left font-medium">Keep</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-100">
                      {offerTypes.map(t => {
                        const stub   = sortedPending.find(o => o.offer_type === t)
                        const target = targetOffers.find(o => o.offer_type === t)
                        const typeLabel = t === 'welcome_bonus' ? 'Welcome'
                          : t === 'additional_offer' ? 'Additional'
                          : t
                        const fmtOffer = (o: { headline: string; points_value: number | null; cashback_value: number | null } | undefined) =>
                          o ? `${o.headline} ${o.points_value ? `(${o.points_value.toLocaleString('en-CA')} pts)` : o.cashback_value ? `($${o.cashback_value})` : ''}` : '—'
                        const canChoose = stub && target
                        return (
                          <tr key={t} className="bg-white">
                            <td className="px-3 py-2 font-medium text-orange-700">{typeLabel}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate text-gray-600">{fmtOffer(stub)}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate text-gray-600">{fmtOffer(target)}</td>
                            <td className="px-3 py-2">
                              {canChoose ? (
                                <div className="flex gap-3">
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`merge-${group.card_id}-${t}`}
                                      checked={offerSelections[t] === stub.id}
                                      onChange={() => setOfferSelections(s => ({ ...s, [t]: stub.id }))}
                                    />
                                    <span>Stub</span>
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`merge-${group.card_id}-${t}`}
                                      checked={offerSelections[t] === target.id}
                                      onChange={() => setOfferSelections(s => ({ ...s, [t]: target.id }))}
                                    />
                                    <span>Target</span>
                                  </label>
                                </div>
                              ) : (
                                <span className="text-gray-400">{stub ? 'stub' : 'target'}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleMerge}
                    disabled={isPending}
                    className="text-sm bg-orange-600 text-white px-3 py-1.5 rounded hover:bg-orange-700 disabled:opacity-40"
                  >
                    {isPending ? 'Merging…' : 'Merge & delete this card'}
                  </button>
                  {mergeErr && <span className="text-xs text-red-600">{mergeErr}</span>}
                </div>
              </div>
            )
          })()}

          {targetOffers == null && mergeTargetId && !isFetchingTarget && mergeErr && (
            <span className="text-xs text-red-600">{mergeErr}</span>
          )}
        </div>
      )}

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
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Foreign Transaction Fee (%)
                <span className="text-gray-400 ml-1">— blank = unknown, 0 = no fee</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={fxFee}
                onChange={e => setFxFee(e.target.value)}
                placeholder="e.g. 2.5"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min. Personal Income ($)</label>
              <input
                type="number"
                step="1000"
                value={minIncome}
                onChange={e => setMinIncome(e.target.value)}
                placeholder="e.g. 60000"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min. Household Income ($)</label>
              <input
                type="number"
                step="1000"
                value={minHousehold}
                onChange={e => setMinHousehold(e.target.value)}
                placeholder="e.g. 80000"
                className={inputCls}
              />
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
            <Th>Cash</Th>
            <Th>Headline</Th>
            <Th>Ltd.</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Active summary row — read-only comparison */}
          {(welcomeActive || additionalActive.length > 0) && (() => {
            const allActive = [welcomeActive, ...additionalActive].filter((o): o is OfferRow => o != null)
            const activeSourcePriority = Math.min(...allActive.map(o => o.source_priority))
            return (
              <tr className="bg-green-50 opacity-80">
                <td className="px-4 py-2.5">
                  <SourceBadge priority={activeSourcePriority} />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-blue-600 font-medium">
                  {welcomeActive?.points_value?.toLocaleString('en-CA') ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-purple-600 font-medium">
                  {additionalActive.length > 0
                    ? <>{additionalActive[0].points_value?.toLocaleString('en-CA') ?? '—'}{additionalActive.length > 1 && <span className="text-gray-400 text-xs ml-1">+{additionalActive.length - 1}</span>}</>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-green-600 font-medium">
                  {activeCashValue != null
                    ? `$${activeCashValue % 1 === 0 ? activeCashValue : activeCashValue.toFixed(2)}`
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                  {welcomeActive?.headline ?? additionalActive[0]?.headline ?? '—'}
                </td>
                <td className="px-4 py-2.5">
                  {activeIsLtd && <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Ltd.</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">active</span>
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => setShowCurrentDetail(v => !v)}
                    className="text-xs text-green-700 hover:underline"
                  >
                    {showCurrentDetail ? 'current ▴' : 'current ▾'}
                  </button>
                </td>
              </tr>
            )
          })()}

          {/* Expandable current offer detail */}
          {showCurrentDetail && sortedActive.length > 0 && (
            <tr>
              <td colSpan={8} className="p-0">
                <div className="px-5 py-4 bg-green-50 border-t border-green-100">
                  {group.card_description && (
                    <p className="text-xs text-gray-500 mb-3 italic">{group.card_description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-6">
                    {welcomeActive && (
                      <ActiveOfferDetail label="Welcome Bonus" offer={welcomeActive} labelColour="blue" />
                    )}
                    {additionalActive.map((o, i) => (
                      <ActiveOfferDetail
                        key={o.id}
                        label={additionalActive.length > 1 ? `Additional Bonus ${i + 1}` : 'Additional Bonus'}
                        offer={o}
                        labelColour="purple"
                      />
                    ))}
                  </div>
                </div>
              </td>
            </tr>
          )}

          {/* Pending summary row */}
          {(welcomePending || additionalPending.length > 0) && (() => {
            const typeCounts = sortedPending.reduce((acc, o) => {
              acc[o.offer_type] = (acc[o.offer_type] ?? 0) + 1
              return acc
            }, {} as Record<string, number>)
            const hasDuplicates = Object.values(typeCounts).some(c => c > 1)
            const allPending = [welcomePending, ...additionalPending].filter((o): o is OfferRow => o != null)
            const pendingSourcePriority = Math.min(...allPending.map(o => o.source_priority))
            return (
              <tr className="bg-amber-50">
                <td className="px-4 py-2.5">
                  <SourceBadge priority={pendingSourcePriority} />
                  {hasDuplicates && (
                    <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Duplicate</span>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-blue-600 font-medium">
                  {welcomePending?.points_value?.toLocaleString('en-CA') ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-purple-600 font-medium">
                  {additionalPending.length > 0
                    ? <>{additionalPending[0].points_value?.toLocaleString('en-CA') ?? '—'}{additionalPending.length > 1 && <span className="text-gray-400 text-xs ml-1">+{additionalPending.length - 1}</span>}</>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-green-600 font-medium">
                  {pendingCashValue != null
                    ? `$${pendingCashValue % 1 === 0 ? pendingCashValue : pendingCashValue.toFixed(2)}`
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">
                  {welcomePending?.headline ?? additionalPending[0]?.headline ?? '—'}
                </td>
                <td className="px-4 py-2.5">
                  {pendingIsLtd && <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Ltd.</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">pending</span>
                  {(() => {
                    const reason = welcomePending?.review_reason ?? additionalPending[0]?.review_reason
                    if (!reason) return null
                    const label = reason === 'new_card' ? 'new card'
                      : reason === 'new_offer' ? 'new offer'
                      : reason === 'higher_bonus' ? 'higher bonus'
                      : reason === 'updated_terms' ? 'updated terms'
                      : reason === 'lower_priority_source' ? 'trusted source'
                      : reason
                    const cls = reason === 'higher_bonus'
                      ? 'bg-blue-100 text-blue-700'
                      : reason === 'new_card' || reason === 'new_offer'
                      ? 'bg-purple-100 text-purple-700'
                      : reason === 'lower_priority_source'
                      ? 'bg-teal-100 text-teal-700'
                      : 'bg-gray-100 text-gray-600'
                    return (
                      <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
                        {label}
                      </span>
                    )
                  })()}
                </td>
                <td className="px-4 py-2.5">
                  {(() => {
                    const conflictTypes = sortedPending
                      .filter(o => sortedActive.some(a => a.offer_type === o.offer_type))
                      .map(o => o.offer_type === 'welcome_bonus' ? 'welcome bonus'
                        : o.offer_type === 'additional_offer' ? 'additional offer'
                        : o.offer_type)
                    return conflictTypes.length > 0 ? (
                      <p className="text-xs text-amber-600 mb-1.5">
                        Will replace current {conflictTypes.join(' & ')}
                      </p>
                    ) : null
                  })()}
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
                    {additionalPending.map((o, i) => (
                      <button
                        key={o.id}
                        onClick={() => {
                          if (!window.confirm('Permanently delete this offer?')) return
                          startTrans(async () => { await deleteOffer(o.id); router.refresh() })
                        }}
                        disabled={isPending}
                        className="text-xs text-red-500 hover:underline disabled:opacity-40"
                      >
                        Del A{additionalPending.length > 1 ? (i + 1) : ''}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })()}

          {/* Inline offer edit panel */}
          {showEditOffers && (
            <tr>
              <td colSpan={8} className="p-0">
                <ReviewOfferEditPanel
                  welcomeOffer={welcomePending ?? null}
                  additionalOffers={additionalPending}
                  cardId={group.card_id}
                  cardHasNoBonus={group.card_has_no_bonus}
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
  welcomeOffer, additionalOffers, cardId, cardHasNoBonus, onDone, onCancel,
}: {
  welcomeOffer: OfferRow | null
  additionalOffers: OfferRow[]
  cardId: string
  cardHasNoBonus: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [isPending, startTrans] = useTransition()
  const [err, setErr]           = useState<string | null>(null)
  const router = useRouter()

  const [noBonus, setNoBonus] = useState(cardHasNoBonus)

  const [wHeadline,  setWHeadline]  = useState(welcomeOffer?.headline ?? '')
  const [wPoints,    setWPoints]    = useState(welcomeOffer?.points_value?.toString() ?? '')
  const [wCash,      setWCash]      = useState(welcomeOffer?.cashback_value?.toString() ?? '')
  const [wSpend,     setWSpend]     = useState(welcomeOffer?.spend_requirement?.toString() ?? '')
  const [wTimeframe, setWTimeframe] = useState(
    welcomeOffer?.spend_timeframe_days ? Math.round(welcomeOffer.spend_timeframe_days / 30).toString() : ''
  )
  const [wLtd,          setWLtd]          = useState(welcomeOffer?.is_limited_time ?? false)
  const [wExpires,      setWExpires]      = useState(welcomeOffer?.expires_at?.slice(0, 10) ?? '')
  const [wStartMonth,   setWStartMonth]   = useState(welcomeOffer?.start_month?.toString() ?? '')
  const [wIsMonthly,    setWIsMonthly]    = useState(welcomeOffer?.is_monthly_bonus ?? false)
  const [wMonthlyPts,   setWMonthlyPts]   = useState(welcomeOffer?.monthly_points_value?.toString() ?? '')
  const [wMonthlyCash,  setWMonthlyCash]  = useState(welcomeOffer?.monthly_cashback_value?.toString() ?? '')
  const [wMonthlySpend, setWMonthlySpend] = useState(welcomeOffer?.monthly_spend_requirement?.toString() ?? '')
  const [wBonusMonths,  setWBonusMonths]  = useState(welcomeOffer?.bonus_months?.toString() ?? '')

  const [additionalDrafts, setAdditionalDrafts] = useState<ReviewAdditionalDraft[]>(() =>
    additionalOffers.map(o => ({
      id: o.id,
      headline: o.headline,
      points: o.points_value?.toString() ?? '',
      cash: o.cashback_value?.toString() ?? '',
      spend: o.spend_requirement?.toString() ?? '',
      timeframeDays: o.spend_timeframe_days ? Math.round(o.spend_timeframe_days / 30).toString() : '',
      startMonth: o.start_month?.toString() ?? '',
      ltd: o.is_limited_time,
      expires: o.expires_at?.slice(0, 10) ?? '',
      is_active: o.is_active,
      isMonthly: o.is_monthly_bonus ?? false,
      monthlyPoints: o.monthly_points_value?.toString() ?? '',
      monthlyCash: o.monthly_cashback_value?.toString() ?? '',
      monthlySpend: o.monthly_spend_requirement?.toString() ?? '',
      bonusMonths: o.bonus_months?.toString() ?? '',
    }))
  )

  function updateDraft(index: number, patch: Partial<ReviewAdditionalDraft>) {
    setAdditionalDrafts(prev => prev.map((d, i) => i === index ? { ...d, ...patch } : d))
  }

  function handleSave() {
    setErr(null)
    startTrans(async () => {
      try {
        if (noBonus) {
          await setCardNoBonus(cardId, true)
          router.refresh()
          onDone()
          return
        }

        // Welcome bonus
        if (welcomeOffer) {
          await updateOffer(welcomeOffer.id, {
            headline: wHeadline,
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: wCash ? Number(wCash) : null,
            spend_requirement: wSpend ? Number(wSpend) : null,
            spend_timeframe_days: wTimeframe ? Number(wTimeframe) * 30 : null,
            start_month: wStartMonth ? Number(wStartMonth) : null,
            is_monthly_bonus: wIsMonthly,
            monthly_points_value: wIsMonthly && wMonthlyPts ? Number(wMonthlyPts) : null,
            monthly_cashback_value: wIsMonthly && wMonthlyCash ? Number(wMonthlyCash) : null,
            monthly_spend_requirement: wIsMonthly && wMonthlySpend ? Number(wMonthlySpend) : null,
            bonus_months: wIsMonthly && wBonusMonths ? Number(wBonusMonths) : null,
            is_active: welcomeOffer.is_active,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
          })
        } else if (wHeadline.trim() || wPoints || wCash) {
          await createOffer({
            card_id: cardId,
            headline: wHeadline.trim(),
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: wCash ? Number(wCash) : null,
            spend_requirement: wSpend ? Number(wSpend) : null,
            spend_timeframe_days: wTimeframe ? Number(wTimeframe) * 30 : null,
            start_month: wStartMonth ? Number(wStartMonth) : null,
            is_monthly_bonus: wIsMonthly,
            monthly_points_value: wIsMonthly && wMonthlyPts ? Number(wMonthlyPts) : null,
            monthly_cashback_value: wIsMonthly && wMonthlyCash ? Number(wMonthlyCash) : null,
            monthly_spend_requirement: wIsMonthly && wMonthlySpend ? Number(wMonthlySpend) : null,
            bonus_months: wIsMonthly && wBonusMonths ? Number(wBonusMonths) : null,
            source_name: 'manual',
            source_priority: 0,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
            is_active: false,
            review_status: 'pending_review',
          })
        }

        // Additional bonuses — update existing, create new
        for (const draft of additionalDrafts) {
          try {
            if (draft.id) {
              const orig = additionalOffers.find(o => o.id === draft.id)
              await updateOffer(draft.id, {
                headline: draft.headline.trim(),
                offer_type: 'additional_offer',
                points_value: draft.points ? Number(draft.points) : null,
                cashback_value: draft.cash ? Number(draft.cash) : null,
                spend_requirement: draft.spend ? Number(draft.spend) : null,
                spend_timeframe_days: draft.timeframeDays ? Number(draft.timeframeDays) * 30 : null,
                start_month: draft.startMonth ? Number(draft.startMonth) : null,
                is_monthly_bonus: draft.isMonthly,
                monthly_points_value: draft.isMonthly && draft.monthlyPoints ? Number(draft.monthlyPoints) : null,
                monthly_cashback_value: draft.isMonthly && draft.monthlyCash ? Number(draft.monthlyCash) : null,
                monthly_spend_requirement: draft.isMonthly && draft.monthlySpend ? Number(draft.monthlySpend) : null,
                bonus_months: draft.isMonthly && draft.bonusMonths ? Number(draft.bonusMonths) : null,
                is_active: orig?.is_active ?? false,
                is_limited_time: draft.ltd,
                expires_at: draft.expires || null,
              })
            } else if (draft.headline.trim() || draft.points || draft.cash) {
              const payload = {
                card_id: cardId,
                headline: draft.headline.trim(),
                offer_type: 'additional_offer',
                points_value: draft.points ? Number(draft.points) : null,
                cashback_value: draft.cash ? Number(draft.cash) : null,
                spend_requirement: draft.spend ? Number(draft.spend) : null,
                spend_timeframe_days: draft.timeframeDays ? Number(draft.timeframeDays) * 30 : null,
                start_month: draft.startMonth ? Number(draft.startMonth) : null,
                is_monthly_bonus: draft.isMonthly,
                monthly_points_value: draft.isMonthly && draft.monthlyPoints ? Number(draft.monthlyPoints) : null,
                monthly_cashback_value: draft.isMonthly && draft.monthlyCash ? Number(draft.monthlyCash) : null,
                monthly_spend_requirement: draft.isMonthly && draft.monthlySpend ? Number(draft.monthlySpend) : null,
                bonus_months: draft.isMonthly && draft.bonusMonths ? Number(draft.bonusMonths) : null,
              }
              await createOffer({
                ...payload,
                source_name: 'manual',
                source_priority: 0,
                is_limited_time: draft.ltd,
                expires_at: draft.expires || null,
                is_active: false,
                review_status: 'pending_review',
              })
            }
          } catch (draftErr) {
            console.error('[handleSave] additional draft failed:', draftErr, { draft, cardId })
            throw draftErr
          }
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
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-4">
        <input
          type="checkbox"
          checked={noBonus}
          onChange={e => setNoBonus(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="font-medium">No welcome bonus available</span>
        <span className="text-xs text-gray-400 font-normal">(marks card as no-bonus and skips offer creation)</span>
      </label>
      {noBonus ? (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} disabled={isPending} className="text-sm text-gray-500 hover:underline disabled:opacity-40">Cancel</button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      ) : (<>
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
            <label className={labelCls}>Cashback ($)</label>
            <input type="number" step="0.01" value={wCash} onChange={e => setWCash(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Spend Req ($)</label>
            <input type="number" value={wSpend} onChange={e => setWSpend(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Timeframe (months)</label>
              <input type="number" value={wTimeframe} onChange={e => setWTimeframe(e.target.value)} placeholder="—" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Start month</label>
              <input type="number" value={wStartMonth} onChange={e => setWStartMonth(e.target.value)} placeholder="—" className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={wLtd} onChange={e => setWLtd(e.target.checked)} className="h-3.5 w-3.5" />
            Limited time
          </label>
          {wLtd && <input type="date" value={wExpires} onChange={e => setWExpires(e.target.value)} className={inputCls} />}
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={wIsMonthly} onChange={e => setWIsMonthly(e.target.checked)} className="h-3.5 w-3.5" />
            Monthly recurring
          </label>
          {wIsMonthly && (
            <>
              <div>
                <label className={labelCls}>Points/month</label>
                <input type="number" value={wMonthlyPts} onChange={e => setWMonthlyPts(e.target.value)} placeholder="—" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cashback/month ($)</label>
                <input type="number" step="0.01" value={wMonthlyCash} onChange={e => setWMonthlyCash(e.target.value)} placeholder="—" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Spend/month ($)</label>
                <input type="number" value={wMonthlySpend} onChange={e => setWMonthlySpend(e.target.value)} placeholder="—" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Months</label>
                <input type="number" value={wBonusMonths} onChange={e => setWBonusMonths(e.target.value)} placeholder="—" className={inputCls} />
              </div>
            </>
          )}
        </div>

        {/* Additional Bonuses */}
        <div className="space-y-4">
          {additionalDrafts.length === 0 && (
            <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide border-b border-purple-200 pb-1">
              Additional Bonus <span className="font-normal text-purple-400 normal-case">(none)</span>
            </h4>
          )}
          {additionalDrafts.map((draft, i) => (
            <div key={draft.id ?? `new-${i}`} className="space-y-2">
              <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide border-b border-purple-200 pb-1">
                {additionalDrafts.length > 1 ? `Additional Bonus ${i + 1}` : 'Additional Bonus'}
                {!draft.id && <span className="font-normal text-purple-400 normal-case"> (new)</span>}
              </h4>
              <div>
                <label className={labelCls}>Headline</label>
                <input value={draft.headline} onChange={e => updateDraft(i, { headline: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Points</label>
                <input type="number" value={draft.points} onChange={e => updateDraft(i, { points: e.target.value })} placeholder="—" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cashback ($)</label>
                <input type="number" step="0.01" value={draft.cash} onChange={e => updateDraft(i, { cash: e.target.value })} placeholder="—" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Spend Req ($)</label>
                <input type="number" value={draft.spend} onChange={e => updateDraft(i, { spend: e.target.value })} placeholder="—" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Timeframe (months)</label>
                  <input type="number" value={draft.timeframeDays} onChange={e => updateDraft(i, { timeframeDays: e.target.value })} placeholder="—" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Start month</label>
                  <input type="number" value={draft.startMonth} onChange={e => updateDraft(i, { startMonth: e.target.value })} placeholder="—" className={inputCls} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={draft.ltd} onChange={e => updateDraft(i, { ltd: e.target.checked })} className="h-3.5 w-3.5" />
                Limited time
              </label>
              {draft.ltd && <input type="date" value={draft.expires} onChange={e => updateDraft(i, { expires: e.target.value })} className={inputCls} />}
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={draft.isMonthly} onChange={e => updateDraft(i, { isMonthly: e.target.checked })} className="h-3.5 w-3.5" />
                Monthly recurring
              </label>
              {draft.isMonthly && (
                <>
                  <div>
                    <label className={labelCls}>Points/month</label>
                    <input type="number" value={draft.monthlyPoints} onChange={e => updateDraft(i, { monthlyPoints: e.target.value })} placeholder="—" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Cashback/month ($)</label>
                    <input type="number" step="0.01" value={draft.monthlyCash} onChange={e => updateDraft(i, { monthlyCash: e.target.value })} placeholder="—" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Spend/month ($)</label>
                    <input type="number" value={draft.monthlySpend} onChange={e => updateDraft(i, { monthlySpend: e.target.value })} placeholder="—" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Months</label>
                    <input type="number" value={draft.bonusMonths} onChange={e => updateDraft(i, { bonusMonths: e.target.value })} placeholder="—" className={inputCls} />
                  </div>
                </>
              )}
              {!draft.id && (
                <button
                  onClick={() => setAdditionalDrafts(prev => prev.filter((_, idx) => idx !== i))}
                  disabled={isPending}
                  className="text-xs text-gray-400 hover:text-red-500 hover:underline disabled:opacity-40 pt-1 block"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setAdditionalDrafts(prev => [
              ...prev,
              { id: undefined, headline: '', points: '', cash: '', spend: '', timeframeDays: '', startMonth: '', ltd: false, expires: '', is_active: false, isMonthly: false, monthlyPoints: '', monthlyCash: '', monthlySpend: '', bonusMonths: '' },
            ])}
            disabled={isPending}
            className="text-xs text-purple-600 hover:underline disabled:opacity-40"
          >
            + Add Another
          </button>
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
      </>)}
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
        if (headline.trim()) {
          await createOffer({
            card_id: cardId,
            headline: headline.trim(),
            offer_type: 'welcome_bonus',
            points_value: wPoints ? Number(wPoints) : null,
            cashback_value: wCash ? Number(wCash) : null,
            spend_requirement: wSpend ? Number(wSpend) : null,
            source_name: 'manual',
            source_priority: 0,
            is_limited_time: wLtd,
            expires_at: wExpires || null,
            is_active: false,
            review_status: 'pending_review',
          })
          await createOffer({
            card_id: cardId,
            headline: headline.trim(),
            offer_type: 'additional_offer',
            points_value: aPoints ? Number(aPoints) : null,
            cashback_value: aCash ? Number(aCash) : null,
            spend_requirement: aSpend ? Number(aSpend) : null,
            source_name: 'manual',
            source_priority: 0,
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

// ── Active offer read-only detail ────────────────────────────────────────────

function ActiveOfferDetail({ label, offer, labelColour }: {
  label: string
  offer: OfferRow
  labelColour: 'blue' | 'purple'
}) {
  const hd = labelColour === 'blue'
    ? 'text-blue-700 border-blue-200'
    : 'text-purple-700 border-purple-200'
  const field = (name: string, value: React.ReactNode) => (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{name}</p>
      <p className="text-sm text-gray-700">{value ?? <span className="text-gray-300">—</span>}</p>
    </div>
  )
  const timeframeMonths = offer.spend_timeframe_days
    ? Math.round(offer.spend_timeframe_days / 30)
    : null

  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wide border-b pb-1 ${hd}`}>{label}</h4>
      {field('Headline', offer.headline)}
      {field('Points', offer.points_value?.toLocaleString('en-CA') ?? null)}
      {field('Cashback', offer.cashback_value != null ? `$${offer.cashback_value}` : null)}
      {field('Spend Req', offer.spend_requirement != null ? `$${offer.spend_requirement.toLocaleString('en-CA')}` : null)}
      {field('Timeframe', timeframeMonths != null ? `${timeframeMonths} month${timeframeMonths !== 1 ? 's' : ''}` : null)}
      {offer.start_month != null && field('Start month', `month ${offer.start_month}`)}
      {offer.is_monthly_bonus && (
        <div className="pl-2 border-l-2 border-gray-200 space-y-1.5 mt-1">
          {field('Points/month', offer.monthly_points_value?.toLocaleString('en-CA') ?? null)}
          {field('Cashback/month', offer.monthly_cashback_value != null ? `$${offer.monthly_cashback_value}` : null)}
          {field('Spend/month', offer.monthly_spend_requirement != null ? `$${offer.monthly_spend_requirement.toLocaleString('en-CA')}` : null)}
          {field('Months', offer.bonus_months)}
        </div>
      )}
      {offer.is_limited_time && field('Expires', offer.expires_at?.slice(0, 10) ?? 'unknown')}
      {field('Source', offer.source_name)}
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

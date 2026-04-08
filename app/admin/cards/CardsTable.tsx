'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCard, updateCard, deactivateCard, reactivateCard, deleteCard } from '../actions'

const TIERS = ['no-fee', 'entry', 'mid', 'premium', 'super-premium'] as const
const ADD_TIERS    = ['entry', 'mid', 'premium'] as const
const NETWORKS     = ['visa', 'mastercard', 'amex', 'other'] as const
const REWARDS_TYPES = ['points', 'cashback'] as const

type Card = {
  id: string
  name: string
  slug: string
  tier: string
  is_active: boolean
  rewards_type: string
  annual_fee: number
  annual_fee_waived_first_year: boolean
  short_description: string | null
  referral_url: string | null
  image_url: string | null
  foreign_transaction_fee: number | null
  min_income: number | null
  minimum_household_income: number | null
  issuer: { name: string } | null
}

type Issuer = { id: string; name: string }

export default function CardsTable({ cards, issuers }: { cards: Card[]; issuers: Issuer[] }) {
  const [editing, setEditing]         = useState<string | null>(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [showTierGuide, setShowTierGuide] = useState(false)
  const [isPending, startTrans]       = useTransition()
  const [error, setError]             = useState<string | null>(null)
  const [filter, setFilter]           = useState('')
  const router = useRouter()

  const visible = filter
    ? cards.filter(c =>
        c.name.toLowerCase().includes(filter.toLowerCase()) ||
        c.slug.includes(filter.toLowerCase())
      )
    : cards

  async function handleSave(card: Card, draft: { name: string; tier: string; is_active: boolean; annual_fee: number; annual_fee_waived_first_year: boolean; short_description: string | null; referral_url: string | null; image_url: string | null; foreign_transaction_fee: number | null; min_income: number | null; minimum_household_income: number | null }) {
    setError(null)
    startTrans(async () => {
      try {
        await updateCard(card.id, draft)
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
        await deactivateCard(id)
        router.refresh()
        setEditing(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Deactivate failed')
      }
    })
  }

  async function handleReactivate(id: string) {
    setError(null)
    startTrans(async () => {
      try {
        await reactivateCard(id)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Reactivate failed')
      }
    })
  }

  async function handleCreate(draft: {
    name: string; issuer_id: string; card_network: string
    tier: string; rewards_type: string; referral_url: string | null; image_url: string | null
  }) {
    setError(null)
    startTrans(async () => {
      try {
        await createCard(draft)
        router.refresh()
        setShowAdd(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Create failed')
      }
    })
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}" and all its offers?`)) return
    setError(null)
    startTrans(async () => {
      try {
        await deleteCard(id)
        router.refresh()
        setEditing(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Filter by name or slug…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          onClick={() => setShowTierGuide(v => !v)}
          className="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 whitespace-nowrap"
        >
          Tier Guide {showTierGuide ? '▴' : '▾'}
        </button>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 whitespace-nowrap"
          >
            + Add Card
          </button>
        )}
      </div>

      {showTierGuide && (
        <div className="grid grid-cols-5 gap-3 text-xs">
          {/* NO-FEE */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <div className="font-semibold text-gray-700 uppercase tracking-wide text-xs border-b border-gray-200 pb-1">No-Fee</div>
            <div className="text-gray-400 font-medium">$0/yr</div>
            <p className="text-gray-600 leading-relaxed">No annual fee. Basic earn rates (1–2x). No lounge access or travel insurance.</p>
            <p className="text-gray-500"><span className="font-medium">Best for:</span> everyday spending, students, credit building.</p>
            <p className="text-gray-400 italic">SimplyCash, Tangerine Money-Back</p>
          </div>
          {/* ENTRY */}
          <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
            <div className="font-semibold text-blue-700 uppercase tracking-wide text-xs border-b border-blue-200 pb-1">Entry</div>
            <div className="text-blue-400 font-medium">$1–$49/yr</div>
            <p className="text-blue-800 leading-relaxed">Low annual fee. Moderate earn rates (2–3x on categories). Basic travel insurance. No lounge access.</p>
            <p className="text-blue-700"><span className="font-medium">Best for:</span> first travel card, occasional travellers.</p>
            <p className="text-blue-400 italic">CIBC Aeroplan Visa, TD Aeroplan Visa Platinum</p>
          </div>
          {/* MID */}
          <div className="bg-indigo-50 rounded-lg p-3 space-y-1.5">
            <div className="font-semibold text-indigo-700 uppercase tracking-wide text-xs border-b border-indigo-200 pb-1">Mid</div>
            <div className="text-indigo-400 font-medium">$50–$149/yr</div>
            <p className="text-indigo-800 leading-relaxed">Solid earn rates (3–5x). Strong travel insurance package. Limited lounge access or Priority Pass entry level. FYF common.</p>
            <p className="text-indigo-700"><span className="font-medium">Best for:</span> frequent travellers, points enthusiasts.</p>
            <p className="text-indigo-400 italic">Amex Cobalt, Scotia Momentum Visa Infinite</p>
          </div>
          {/* PREMIUM */}
          <div className="bg-purple-50 rounded-lg p-3 space-y-1.5">
            <div className="font-semibold text-purple-700 uppercase tracking-wide text-xs border-b border-purple-200 pb-1">Premium</div>
            <div className="text-purple-400 font-medium">$150–$299/yr</div>
            <p className="text-purple-800 leading-relaxed">High earn rates (5x+). Comprehensive insurance. Full lounge access (Priority Pass or Amex Centurion). Concierge service. Strong travel credits.</p>
            <p className="text-purple-700"><span className="font-medium">Best for:</span> road warriors, high spenders, business travellers.</p>
            <p className="text-purple-400 italic">Amex Gold, TD Aeroplan Visa Infinite</p>
          </div>
          {/* SUPER-PREMIUM */}
          <div className="bg-amber-50 rounded-lg p-3 space-y-1.5">
            <div className="font-semibold text-amber-700 uppercase tracking-wide text-xs border-b border-amber-200 pb-1">Super-Premium</div>
            <div className="text-amber-400 font-medium">$300+/yr</div>
            <p className="text-amber-800 leading-relaxed">Top-tier earn rates. Unlimited lounge access globally. Hotel/airline status. Annual travel credits that offset the fee. Metal card.</p>
            <p className="text-amber-700"><span className="font-medium">Best for:</span> luxury travellers, those who can offset the fee with credits.</p>
            <p className="text-amber-400 italic">Amex Platinum, TD Aeroplan Visa Infinite Privilege</p>
          </div>
        </div>
      )}

      {showAdd && (
        <AddCardForm
          issuers={issuers}
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
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Issuer</th>
              <th className="px-4 py-2 text-left">Tier</th>
              <th className="px-4 py-2 text-right">Annual Fee</th>
              <th className="px-4 py-2 text-left">FYF</th>
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-left">Active</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(card =>
              editing === card.id
                ? <EditRow
                    key={card.id}
                    card={card}
                    isPending={isPending}
                    onSave={draft => handleSave(card, draft)}
                    onCancel={() => setEditing(null)}
                  />
                : <ViewRow
                    key={card.id}
                    card={card}
                    isPending={isPending}
                    onEdit={() => setEditing(card.id)}
                    onDeactivate={() => handleDeactivate(card.id)}
                    onReactivate={() => handleReactivate(card.id)}
                    onDelete={() => handleDelete(card.id, card.name)}
                  />
            )}
            {visible.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No cards found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{visible.length} of {cards.length} shown</p>
    </div>
  )
}

// ── View row ─────────────────────────────────────────────────────────────────

function ViewRow({
  card, isPending, onEdit, onDeactivate, onReactivate, onDelete,
}: {
  card: Card
  isPending: boolean
  onEdit: () => void
  onDeactivate: () => void
  onReactivate: () => void
  onDelete: () => void
}) {
  return (
    <tr className={`hover:bg-gray-50 ${!card.is_active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {card.image_url && (
            <img src={card.image_url} alt="" className="h-8 w-8 object-contain flex-shrink-0" />
          )}
          <div>
            <div className="font-medium">{card.name}</div>
            <div className="text-xs text-gray-400 font-mono">{card.slug}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 text-gray-600">{card.issuer?.name ?? '—'}</td>
      <td className="px-4 py-2.5">
        <TierBadge tier={card.tier} />
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
        {card.annual_fee ? `$${card.annual_fee}` : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5">
        {card.annual_fee_waived_first_year
          ? <span className="text-green-600 font-medium">✓</span>
          : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">
        {card.short_description
          ? <span title={card.short_description}>{card.short_description.slice(0, 60)}{card.short_description.length > 60 ? '…' : ''}</span>
          : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5">
        <ActiveDot active={card.is_active} />
      </td>
      <td className="px-4 py-2.5 space-x-2 whitespace-nowrap">
        <button
          onClick={onEdit}
          disabled={isPending}
          className="text-xs text-blue-600 hover:underline disabled:opacity-40"
        >
          Edit
        </button>
        {card.is_active ? (
          <button
            onClick={onDeactivate}
            disabled={isPending}
            className="text-xs text-red-500 hover:underline disabled:opacity-40"
          >
            Deactivate
          </button>
        ) : (
          <button
            onClick={onReactivate}
            disabled={isPending}
            className="text-xs text-green-600 hover:underline disabled:opacity-40"
          >
            Reactivate
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={isPending}
          className="text-xs text-gray-400 hover:text-red-600 hover:underline disabled:opacity-40"
        >
          Delete
        </button>
      </td>
    </tr>
  )
}

// ── Edit row ──────────────────────────────────────────────────────────────────

function EditRow({
  card, isPending, onSave, onCancel,
}: {
  card: Card
  isPending: boolean
  onSave: (draft: { name: string; tier: string; is_active: boolean; annual_fee: number; annual_fee_waived_first_year: boolean; short_description: string | null; referral_url: string | null; image_url: string | null; foreign_transaction_fee: number | null; min_income: number | null; minimum_household_income: number | null }) => void
  onCancel: () => void
}) {
  const [name, setName]                                       = useState(card.name)
  const [tier, setTier]                                       = useState(card.tier)
  const [is_active, setIsActive]                              = useState(card.is_active)
  const [annual_fee, setAnnualFee]                            = useState(card.annual_fee.toString())
  const [annual_fee_waived_first_year, setFyfWaived]          = useState(card.annual_fee_waived_first_year)
  const [short_description, setShortDesc]                     = useState(card.short_description ?? '')
  const [referral_url, setReferralUrl]                        = useState(card.referral_url ?? '')
  const [image_url, setImageUrl]                              = useState(card.image_url ?? '')
  const [fx_fee, setFxFee]                                    = useState(card.foreign_transaction_fee?.toString() ?? '')
  const [min_income, setMinIncome]                            = useState(card.min_income?.toString() ?? '')
  const [min_household, setMinHousehold]                      = useState(card.minimum_household_income?.toString() ?? '')

  return (
    <>
      <tr className="bg-blue-50">
        <td className="px-4 py-2.5">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="text-xs text-gray-400 font-mono mt-0.5">{card.slug}</div>
        </td>
        <td className="px-4 py-2.5 text-gray-600">{card.issuer?.name ?? '—'}</td>
        <td className="px-4 py-2.5">
          <select
            value={tier}
            onChange={e => setTier(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400 italic text-xs">see below</td>
        <td className="px-4 py-2.5 text-gray-400 italic text-xs">see below</td>
        <td className="px-4 py-2.5">
          <input
            type="checkbox"
            checked={is_active}
            onChange={e => setIsActive(e.target.checked)}
            className="h-4 w-4"
          />
        </td>
        <td className="px-4 py-2.5 space-x-2">
          <button
            onClick={() => onSave({
              name, tier, is_active,
              annual_fee: annual_fee ? Number(annual_fee) : 0,
              annual_fee_waived_first_year,
              short_description: short_description.trim() || null,
              referral_url: referral_url.trim() || null,
              image_url: image_url.trim() || null,
              foreign_transaction_fee: fx_fee !== '' ? Number(fx_fee) : null,
              min_income: min_income !== '' ? Number(min_income) : null,
              minimum_household_income: min_household !== '' ? Number(min_household) : null,
            })}
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
      <tr className="bg-blue-50 border-t border-blue-100">
        <td colSpan={8} className="px-4 pb-3 space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Short description</label>
            <textarea
              value={short_description}
              onChange={e => setShortDesc(e.target.value)}
              rows={2}
              placeholder="1-line marketing description shown on card listings…"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Referral / affiliate URL</label>
            <input
              type="url"
              value={referral_url}
              onChange={e => setReferralUrl(e.target.value)}
              placeholder="https://…"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Image URL</label>
            <input
              type="url"
              value={image_url}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://…"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Annual Fee ($)</label>
            <input
              type="number"
              value={annual_fee}
              onChange={e => setAnnualFee(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400"
              placeholder="0"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={annual_fee_waived_first_year}
                onChange={e => setFyfWaived(e.target.checked)}
                className="h-4 w-4"
              />
              Annual fee waived first year (FYF)
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
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
                value={fx_fee}
                onChange={e => setFxFee(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400"
                placeholder="e.g. 2.5"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min. Personal Income ($)</label>
              <input
                type="number"
                step="1000"
                value={min_income}
                onChange={e => setMinIncome(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400"
                placeholder="e.g. 60000"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min. Household Income ($)</label>
              <input
                type="number"
                step="1000"
                value={min_household}
                onChange={e => setMinHousehold(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400"
                placeholder="e.g. 80000"
              />
            </div>
          </div>
        </td>
      </tr>
    </>
  )
}

// ── Add Card form ─────────────────────────────────────────────────────────────

function AddCardForm({
  issuers, isPending, onSave, onCancel,
}: {
  issuers: Issuer[]
  isPending: boolean
  onSave: (draft: { name: string; issuer_id: string; card_network: string; tier: string; rewards_type: string; referral_url: string | null; image_url: string | null }) => void
  onCancel: () => void
}) {
  const [name,         setName]        = useState('')
  const [issuer_id,    setIssuerId]    = useState(issuers[0]?.id ?? '')
  const [card_network, setNetwork]     = useState<string>('visa')
  const [tier,         setTier]        = useState<string>('entry')
  const [rewards_type, setRewardsType] = useState<string>('points')
  const [referral_url, setReferralUrl] = useState('')
  const [image_url,    setImageUrl]    = useState('')

  function handleSave() {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      issuer_id,
      card_network,
      tier,
      rewards_type,
      referral_url: referral_url.trim() || null,
      image_url: image_url.trim() || null,
    })
  }

  const inputCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium text-gray-700">New Card</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs text-gray-500 mb-1">Name <span className="text-red-400">*</span></label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. TD Aeroplan Visa Infinite"
            className={`w-full ${inputCls}`}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Issuer</label>
          <select value={issuer_id} onChange={e => setIssuerId(e.target.value)} className={`w-full ${inputCls}`}>
            {issuers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Network</label>
          <select value={card_network} onChange={e => setNetwork(e.target.value)} className={`w-full ${inputCls}`}>
            {NETWORKS.map(n => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)} className={`w-full ${inputCls}`}>
            {ADD_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rewards type</label>
          <select value={rewards_type} onChange={e => setRewardsType(e.target.value)} className={`w-full ${inputCls}`}>
            {REWARDS_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs text-gray-500 mb-1">Referral URL (optional)</label>
          <input
            type="url"
            value={referral_url}
            onChange={e => setReferralUrl(e.target.value)}
            placeholder="https://…"
            className={`w-full ${inputCls}`}
          />
        </div>
        <div className="col-span-2 sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Image URL (optional)</label>
          <input
            type="url"
            value={image_url}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://…"
            className={`w-full ${inputCls}`}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isPending || !name.trim()}
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

function ActiveDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-300'}`} />
  )
}

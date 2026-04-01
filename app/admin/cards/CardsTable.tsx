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
  short_description: string | null
  referral_url: string | null
  issuer: { name: string } | null
}

type Issuer = { id: string; name: string }

export default function CardsTable({ cards, issuers }: { cards: Card[]; issuers: Issuer[] }) {
  const [editing, setEditing]     = useState<string | null>(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [isPending, startTrans]   = useTransition()
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState('')
  const router = useRouter()

  const visible = filter
    ? cards.filter(c =>
        c.name.toLowerCase().includes(filter.toLowerCase()) ||
        c.slug.includes(filter.toLowerCase())
      )
    : cards

  async function handleSave(card: Card, draft: { name: string; tier: string; is_active: boolean; short_description: string | null; referral_url: string | null }) {
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
    tier: string; rewards_type: string; referral_url: string | null
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
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 whitespace-nowrap"
          >
            + Add Card
          </button>
        )}
      </div>

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
              <th className="px-4 py-2 text-left">Type</th>
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
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No cards found</td></tr>
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
        <div className="font-medium">{card.name}</div>
        <div className="text-xs text-gray-400 font-mono">{card.slug}</div>
      </td>
      <td className="px-4 py-2.5 text-gray-600">{card.issuer?.name ?? '—'}</td>
      <td className="px-4 py-2.5">
        <TierBadge tier={card.tier} />
      </td>
      <td className="px-4 py-2.5 text-gray-600 capitalize">{card.rewards_type}</td>
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
  onSave: (draft: { name: string; tier: string; is_active: boolean; short_description: string | null; referral_url: string | null }) => void
  onCancel: () => void
}) {
  const [name, setName]                       = useState(card.name)
  const [tier, setTier]                       = useState(card.tier)
  const [is_active, setIsActive]              = useState(card.is_active)
  const [short_description, setShortDesc]     = useState(card.short_description ?? '')
  const [referral_url, setReferralUrl]        = useState(card.referral_url ?? '')

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
        <td className="px-4 py-2.5 text-gray-600 capitalize">{card.rewards_type}</td>
        <td className="px-4 py-2.5 text-xs text-gray-400 italic">see below</td>
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
              short_description: short_description.trim() || null,
              referral_url: referral_url.trim() || null,
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
        <td colSpan={7} className="px-4 pb-3 space-y-2">
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
  onSave: (draft: { name: string; issuer_id: string; card_network: string; tier: string; rewards_type: string; referral_url: string | null }) => void
  onCancel: () => void
}) {
  const [name,         setName]        = useState('')
  const [issuer_id,    setIssuerId]    = useState(issuers[0]?.id ?? '')
  const [card_network, setNetwork]     = useState<string>('visa')
  const [tier,         setTier]        = useState<string>('entry')
  const [rewards_type, setRewardsType] = useState<string>('points')
  const [referral_url, setReferralUrl] = useState('')

  function handleSave() {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      issuer_id,
      card_network,
      tier,
      rewards_type,
      referral_url: referral_url.trim() || null,
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

'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateCard, deactivateCard } from '../actions'

const TIERS = ['no-fee', 'entry', 'mid', 'premium', 'super-premium'] as const

type Card = {
  id: string
  name: string
  slug: string
  tier: string
  is_active: boolean
  rewards_type: string
  issuer: { name: string } | null
}

export default function CardsTable({ cards }: { cards: Card[] }) {
  const [editing, setEditing]   = useState<string | null>(null)
  const [isPending, startTrans] = useTransition()
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState('')
  const router = useRouter()

  const visible = filter
    ? cards.filter(c =>
        c.name.toLowerCase().includes(filter.toLowerCase()) ||
        c.slug.includes(filter.toLowerCase())
      )
    : cards

  async function handleSave(card: Card, draft: { name: string; tier: string; is_active: boolean }) {
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

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="Filter by name or slug…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full max-w-sm border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
      />

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
                  />
            )}
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No cards found</td></tr>
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
  card, isPending, onEdit, onDeactivate,
}: {
  card: Card
  isPending: boolean
  onEdit: () => void
  onDeactivate: () => void
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
      <td className="px-4 py-2.5">
        <ActiveDot active={card.is_active} />
      </td>
      <td className="px-4 py-2.5 space-x-2">
        <button
          onClick={onEdit}
          disabled={isPending}
          className="text-xs text-blue-600 hover:underline disabled:opacity-40"
        >
          Edit
        </button>
        {card.is_active && (
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
  card, isPending, onSave, onCancel,
}: {
  card: Card
  isPending: boolean
  onSave: (draft: { name: string; tier: string; is_active: boolean }) => void
  onCancel: () => void
}) {
  const [name, setName]           = useState(card.name)
  const [tier, setTier]           = useState(card.tier)
  const [is_active, setIsActive]  = useState(card.is_active)

  return (
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
          onClick={() => onSave({ name, tier, is_active })}
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

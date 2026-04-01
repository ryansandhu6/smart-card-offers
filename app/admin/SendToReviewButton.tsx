'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendCardToReview } from './actions'

export default function SendToReviewButton({ cardId }: { cardId: string }) {
  const [isPending, startTrans] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function handleClick() {
    setErr(null)
    startTrans(async () => {
      const result = await sendCardToReview(cardId)
      if (result.success) {
        router.push('/admin/review')
      } else {
        setErr(result.error ?? 'Failed')
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-xs text-blue-600 hover:underline disabled:opacity-40 whitespace-nowrap"
      >
        {isPending ? 'Sending…' : 'Send to Review →'}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  )
}

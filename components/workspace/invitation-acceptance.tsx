'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInvitationAction } from '@/app/actions/platform'
import { Button } from '@/components/ui/button'

export default function InvitationAcceptance({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function accept() {
    setError('')
    setLoading(true)
    const result = await acceptInvitationAction({ token })
    setLoading(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.push('/workspace')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Accept this invitation while signed in as <strong className="text-foreground">{email}</strong>.</p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button disabled={loading} onClick={() => void accept()}>{loading ? 'Accepting…' : 'Accept invitation'}</Button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { changePasswordAction, listSessionsAction, revokeOtherSessionsAction, revokeSessionAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

type Session = { id: string; userAgent: string | null; createdAt: Date; lastActiveAt: Date; expiresAt: Date; current: boolean }

export default function SecuritySessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadSessions() {
    setLoading(true)
    const result = await listSessionsAction()
    setLoading(false)
    if ('error' in result) setError(result.error)
    else setSessions(result.data as Session[])
  }

  useEffect(() => {
    let active = true
    void listSessionsAction().then(result => {
      if (!active) return
      if ('error' in result) setError(result.error)
      else setSessions(result.data as Session[])
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function changePassword(formData: FormData) {
    setError('')
    setMessage('')
    const currentPassword = String(formData.get('currentPassword') ?? '')
    const password = String(formData.get('password') ?? '')
    const result = await changePasswordAction({ currentPassword, password })
    if ('error' in result) setError(result.error)
    else {
      setMessage('Password updated. Other sessions have been signed out.')
      await loadSessions()
    }
  }

  async function revokeOthers() {
    const result = await revokeOtherSessionsAction()
    if ('error' in result) setError(result.error)
    else {
      setSessions(items => items.filter(item => item.current))
      setMessage('Other sessions signed out.')
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border p-4">
      <h3 className="font-semibold">Security</h3>
      <p className="mt-1 text-xs text-muted-foreground">Change your password and manage active sessions.</p>
      <form action={changePassword} className="mt-4 grid gap-3 sm:grid-cols-3">
        <input name="currentPassword" type="password" required minLength={8} autoComplete="current-password" placeholder="Current password" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="New password" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <Button type="submit">Update password</Button>
      </form>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium">Active sessions</h4>
        <Button size="sm" variant="outline" onClick={() => void revokeOthers()}>Sign out other sessions</Button>
      </div>
      {loading ? <p className="py-4 text-sm text-muted-foreground">Loading sessions…</p> : <div className="mt-2 divide-y divide-border">
        {sessions.map(session => <div key={session.id} className="flex flex-wrap items-center gap-2 py-3 text-xs">
          <span className="min-w-0 flex-1 truncate">{session.current ? 'Current session' : session.userAgent || 'Unknown device'}</span>
          <span className="text-muted-foreground">Created {new Date(session.createdAt).toLocaleString()}</span>
          <span className="text-muted-foreground">Active {new Date(session.lastActiveAt).toLocaleString()}</span>
          {!session.current && <button className="text-destructive" onClick={async () => {
            const result = await revokeSessionAction({ id: session.id })
            if ('error' in result) setError(result.error)
            else setSessions(items => items.filter(item => item.id !== session.id))
          }}>Revoke</button>}
        </div>)}
        {!sessions.length && <p className="py-3 text-xs text-muted-foreground">No active sessions.</p>}
      </div>}
      {message && <p className="mt-3 text-sm text-emerald-600" role="status">{message}</p>}
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
    </section>
  )
}

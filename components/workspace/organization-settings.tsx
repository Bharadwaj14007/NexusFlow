'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOutAction, updateOrganizationAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

function inputClass() {
  return 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
}

export function OrganizationSettings({
  organization,
  onSaved,
}: {
  organization: { name: string; type: string | null }
  onSaved: (message: string) => void
}) {
  const router = useRouter()
  const [name, setName] = useState(organization.name)
  const [type, setType] = useState(organization.type || 'Technology')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        setPending(true)
        const result = await updateOrganizationAction({ name, type })
        setPending(false)
        if (result && 'error' in result && result.error) {
          setError(result.error)
          return
        }
        onSaved('Organization settings saved')
        router.refresh()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium">Organization name
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass()} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium">Organization type
          <select value={type} onChange={(event) => setType(event.target.value)} className={inputClass()}>
            <option>Technology</option>
            <option>Professional services</option>
            <option>Marketing</option>
            <option>Other</option>
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving' : 'Save changes'}</Button>
        <Button type="button" variant="outline" onClick={() => void signOutAction()}>Sign out</Button>
      </div>
    </form>
  )
}

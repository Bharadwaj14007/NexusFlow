'use client'

import { useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { createOrganizationAction, switchOrganizationAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

export type OrgOption = { id: string; name: string; type: string | null; role: string }

function inputClass() {
  return 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
}

export function OrgSwitcher({
  organization,
  organizations,
}: {
  organization: { id: string; name: string; type: string | null }
  organizations: OrgOption[]
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('Technology')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const mark = organization.name.trim().charAt(0).toUpperCase() || 'N'

  const create = async () => {
    setError('')
    setPending(true)
    const result = await createOrganizationAction({ name, type })
    setPending(false)
    if (result?.error) setError(result.error)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-lg border border-border/70 p-2.5 text-left hover:bg-muted"
      >
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">{mark}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{organization.name}</span>
          <span className="block text-[10px] text-muted-foreground">{organization.type || 'Business workspace'}</span>
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-2 rounded-lg border border-border bg-card p-2 shadow-lg">
          {organizations.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={async () => {
                if (item.id === organization.id) {
                  setOpen(false)
                  return
                }
                const result = await switchOrganizationAction(item.id)
                if (result?.error) setError(result.error)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{item.name}</span>
                <span className="block text-[10px] text-muted-foreground">{item.role}</span>
              </span>
              {item.id === organization.id && <Check className="size-3.5 text-primary" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setCreating(true); setOpen(false) }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium text-primary hover:bg-muted"
          >
            <Plus className="size-3.5" /> New organization
          </button>
          {error && <p className="px-2 pt-1 text-[11px] text-destructive">{error}</p>}
        </div>
      )}
      {creating && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create organization">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 className="font-semibold">Create organization</h2>
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void create()
              }}
            >
              <label className="flex flex-col gap-1.5 text-xs font-medium">Organization name
                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className={inputClass()} placeholder="e.g. Atlas Labs" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium">Organization type
                <select value={type} onChange={(event) => setType(event.target.value)} className={inputClass()}>
                  <option>Technology</option>
                  <option>Professional services</option>
                  <option>Marketing</option>
                  <option>Other</option>
                </select>
              </label>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? 'Creating' : 'Create organization'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

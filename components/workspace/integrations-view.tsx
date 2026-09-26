'use client'

import { useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'

type Provider = {
  provider: 'SLACK' | 'GITHUB' | 'GOOGLE' | 'LINEAR'
  configured: boolean
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  accountName: string | null
  accountId: string | null
  lastCheckedAt: string | null
}
const labels: Record<Provider['provider'], string> = { SLACK: 'Slack', GITHUB: 'GitHub', GOOGLE: 'Google Drive', LINEAR: 'Linear' }

export default function IntegrationsView() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function refresh() {
    const response = await fetch('/api/integrations', { cache: 'no-store' })
    const data = await response.json() as { providers?: Provider[]; error?: string }
    if (!response.ok || !data.providers) throw new Error(data.error ?? 'Unable to load integrations.')
    setProviders(data.providers)
  }
  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const callbackStatus = params.get('integration')
    if (params.has('integration')) window.history.replaceState({}, '', '/workspace')
    void fetch('/api/integrations', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json() as { providers?: Provider[]; error?: string }
        if (!response.ok || !data.providers) throw new Error(data.error ?? 'Unable to load integrations.')
        if (active) {
          setProviders(data.providers)
          if (callbackStatus === 'connected') setMessage('Integration connected and verified.')
          if (callbackStatus === 'error') setError('Integration authorization did not complete. Check provider setup and try again.')
        }
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load integrations.') })
    return () => { active = false }
  }, [])

  async function act(provider: Provider, action: 'test' | 'disconnect') {
    setBusy(provider.provider)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/integrations/${provider.provider.toLowerCase()}`, { method: action === 'test' ? 'POST' : 'DELETE' })
      const result = await response.json() as { error?: string; accountName?: string }
      if (!response.ok) throw new Error(result.error ?? 'Integration request failed.')
      if (action === 'test') setMessage(`${labels[provider.provider]} connection verified${result.accountName ? ` for ${result.accountName}` : ''}.`)
      else setMessage(`${labels[provider.provider]} disconnected.`)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Integration request failed.')
    } finally {
      setBusy(null)
    }
  }

  return <div className="flex flex-col gap-6">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
      <p className="mt-1 text-sm text-muted-foreground">Connect organization accounts with verified OAuth credentials.</p>
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{message}</p>}
    {!providers.length && !error && <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading integrations…</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {providers.map(provider => <article key={provider.provider} className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="font-semibold">{labels[provider.provider]}</h3><p className="mt-1 text-xs text-muted-foreground">{provider.accountName ?? 'Organization connection'}</p></div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${provider.status === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-600' : provider.status === 'ERROR' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{provider.status}</span>
        </div>
        {provider.lastCheckedAt && <p className="mt-3 text-xs text-muted-foreground">Last verified {new Date(provider.lastCheckedAt).toLocaleString()}</p>}
        {!provider.configured && <p className="mt-3 text-xs text-muted-foreground">Add this provider’s OAuth client ID and secret, and set INTEGRATION_ENCRYPTION_KEY to enable a secure connection.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {provider.status === 'CONNECTED'
            ? <><Button size="sm" variant="outline" disabled={busy === provider.provider} onClick={() => void act(provider, 'test')}>{busy === provider.provider ? 'Checking…' : 'Test connection'}</Button><Button size="sm" variant="outline" disabled={busy === provider.provider} onClick={() => void act(provider, 'disconnect')}>Disconnect</Button></>
            : provider.configured
              ? <a className={buttonVariants({ size: 'sm' })} href={`/api/integrations/connect/${provider.provider.toLowerCase()}`}>Connect {labels[provider.provider]}</a>
              : <Button size="sm" disabled>Connect {labels[provider.provider]}</Button>}
        </div>
      </article>)}
    </div>
  </div>
}

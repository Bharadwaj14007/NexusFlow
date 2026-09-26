'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type BillingData = {
  subscription: {
    plan: string
    pendingPlan: string | null
    status: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    providerSubscriptionId: string | null
  }
  usage: {
    aiRequests: number
    aiRequestLimit: number
    seats: number
    seatLimit: number
    documents: number
    documentLimit: number
  }
  canManage: boolean
}

type Checkout = { keyId: string; subscriptionId: string; shortUrl: string | null; prefill: { email: string; name: string } }
type RazorpayResult = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }
declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string
      subscription_id: string
      name: string
      description: string
      prefill: { email: string; name: string }
      handler: (result: RazorpayResult) => void
      modal: { ondismiss: () => void }
    }) => { open: () => void }
  }
}

export default function BillingView() {
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const response = await fetch('/api/billing', { cache: 'no-store' })
    const result = await response.json() as BillingData | { error?: string }
    if (!response.ok || !('subscription' in result)) throw new Error(('error' in result && result.error) || 'Unable to load billing information.')
    setBilling(result)
  }
  useEffect(() => {
    let active = true
    void fetch('/api/billing', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as BillingData | { error?: string }
        if (!response.ok || !('subscription' in result)) throw new Error(('error' in result && result.error) || 'Unable to load billing information.')
        if (active) setBilling(result)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load billing information.') })
    return () => { active = false }
  }, [])

  async function checkout(plan: 'PRO' | 'ENTERPRISE') {
    setBusy(true)
    setError('')
    let checkoutSubscriptionId: string | undefined
    try {
      const response = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) })
      const result = await response.json() as Checkout | { error?: string }
      if (!response.ok || !('subscriptionId' in result)) throw new Error(('error' in result && result.error) || 'Unable to start checkout.')
      checkoutSubscriptionId = result.subscriptionId
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Unable to load the payment checkout.'))
          document.body.appendChild(script)
        })
      }
      if (!window.Razorpay) throw new Error('Payment checkout is unavailable.')
      const checkoutInstance = new window.Razorpay({
        key: result.keyId,
        subscription_id: result.subscriptionId,
        name: 'NexusFlow',
        description: `${plan} organization subscription`,
        prefill: result.prefill,
        handler: async payment => {
          try {
            const verified = await fetch('/api/billing/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payment) })
            if (!verified.ok) {
              const failure = await verified.json() as { error?: string }
              setError(failure.error ?? 'Unable to verify payment.')
              await refresh().catch(() => undefined)
              return
            }
            await refresh()
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Unable to verify payment.')
          } finally {
            setBusy(false)
          }
        },
        modal: {
          ondismiss: () => {
            void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to refresh billing information.'))
            setBusy(false)
          },
        },
      })
      checkoutInstance.open()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start checkout.')
      if (checkoutSubscriptionId) {
        await fetch('/api/billing/cancel', { method: 'POST' }).then(() => refresh()).catch(() => undefined)
      }
      setBusy(false)
    }
  }

  async function cancelSubscription() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/billing/cancel', { method: 'POST' })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to schedule cancellation.')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to schedule cancellation.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex flex-col gap-6">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Billing</h2>
      <p className="mt-1 text-sm text-muted-foreground">Manage your organization plan, subscription, and limits.</p>
    </div>
    {!billing && !error && <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading billing details…</p>}
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    {billing && <>
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Current plan</h3>
        <p className="mt-2 text-sm">{billing.subscription.plan} · {billing.subscription.status.replace('_', ' ').toLowerCase()}</p>
        {billing.subscription.pendingPlan && <p className="mt-1 text-xs text-muted-foreground">Checkout pending for {billing.subscription.pendingPlan}.</p>}
        {billing.subscription.currentPeriodEnd && <p className="mt-1 text-xs text-muted-foreground">Current period ends {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}.</p>}
        {billing.subscription.cancelAtPeriodEnd && <p className="mt-1 text-xs text-muted-foreground">Cancellation is scheduled at the end of this billing period.</p>}
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <UsageCard label="AI requests" current={billing.usage.aiRequests} limit={billing.usage.aiRequestLimit} />
        <UsageCard label="Team seats" current={billing.usage.seats} limit={billing.usage.seatLimit} />
        <UsageCard label="Documents" current={billing.usage.documents} limit={billing.usage.documentLimit} />
      </section>
      {billing.canManage && <section className="grid gap-4 md:grid-cols-2">
        {(['PRO', 'ENTERPRISE'] as const).map(plan => <article key={plan} className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold">{plan}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{plan === 'PRO' ? 'Expanded AI, project, document, and team capacity.' : 'Highest organization capacity for large teams.'}</p>
          <Button className="mt-4" disabled={busy || billing.subscription.plan === plan} onClick={() => void checkout(plan)}>{busy ? 'Please wait…' : billing.subscription.plan === plan ? 'Current plan' : 'Subscribe with Razorpay'}</Button>
        </article>)}
      </section>}
      {billing.canManage && billing.subscription.providerSubscriptionId && !billing.subscription.cancelAtPeriodEnd && <Button variant="outline" disabled={busy} onClick={() => void cancelSubscription()}>{billing.subscription.pendingPlan ? 'Cancel checkout' : 'Cancel at period end'}</Button>}
    </>}
  </div>
}

function UsageCard({ label, current, limit }: { label: string; current: number; limit: number }) {
  return <article className="rounded-xl border border-border bg-card p-5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-2 text-xl font-semibold">{current.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ {limit.toLocaleString()}</span></p>
  </article>
}

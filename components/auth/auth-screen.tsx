'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { completeOnboardingAction, requestPasswordResetAction, resetPasswordAction, signInAction, signUpAction } from '@/app/actions/auth'

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'onboarding'

export default function AuthScreen({
  initialMode = 'signin',
  defaultName = 'Alex Morgan',
  defaultOrganization = 'Nexus Labs',
  initialResetToken = '',
  inviteToken = '',
}: {
  initialMode?: Mode
  defaultName?: string
  defaultOrganization?: string
  initialResetToken?: string
  inviteToken?: string
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetToken] = useState(initialResetToken)
  const [name, setName] = useState(defaultName)
  const [organization, setOrganization] = useState(defaultOrganization)
  const [organizationType, setOrganizationType] = useState('Technology')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!email.includes('@')) return setError('Enter a valid work email.')
    if (mode === 'forgot') {
      setLoading(true)
      const result = await requestPasswordResetAction({ email })
      setLoading(false)
      if ('error' in result) setError(result.error)
      else setMessage('If an account exists for this email, password reset instructions will be sent when available.')
      return
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (mode === 'reset') {
      if (password !== confirmPassword) return setError('Passwords do not match.')
      setLoading(true)
      const result = await resetPasswordAction({ token: resetToken, password })
      setLoading(false)
      if ('error' in result) setError(result.error)
      else {
        setMode('signin')
        setPassword('')
        setMessage('Password reset. Sign in with your new password.')
      }
      return
    }

    setLoading(true)
    const returnTo = inviteToken ? `/invitations/${inviteToken}` : undefined
    const result = mode === 'signup'
      ? await signUpAction({ name, email, password, returnTo })
      : await signInAction({ email, password, returnTo })
    setLoading(false)
    if (result?.error) setError(result.error)
  }

  const finishOnboarding = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    const result = await completeOnboardingAction({
      name,
      organizationName: organization.trim() || `${name.trim()}'s workspace`,
      organizationType,
    })
    setLoading(false)
    if (result?.error) setError(result.error)
  }

  if (mode === 'onboarding') return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl flex-col justify-center">
        <div className="mb-10 flex items-center justify-between">
          <strong className="text-lg tracking-tight">Nexus<span className="text-primary">Flow</span></strong>
          <button
            type="button"
            onClick={() => {
              void completeOnboardingAction({
                name: name.trim() || 'Alex Morgan',
                organizationName: organization.trim() || `${(name.trim() || 'Alex').split(' ')[0]}'s workspace`,
                organizationType,
              })
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </button>
        </div>
        <div className="grid gap-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Check className="size-5" /></span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-primary">Workspace setup</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Make this workspace yours.</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Set the basics now. You can change everything later from Settings.</p>
          </div>
          <form className="flex flex-col gap-4" onSubmit={finishOnboarding}>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Your name<input value={name} onChange={e=>setName(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Organization name<input value={organization} onChange={e=>setOrganization(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Organization type<select value={organizationType} onChange={e=>setOrganizationType(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"><option>Technology</option><option>Professional services</option><option>Marketing</option><option>Other</option></select></label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="mt-2" disabled={loading} type="submit">{loading && <Loader2 className="animate-spin" data-icon="inline-start" />}Enter workspace <ArrowRight data-icon="inline-end" /></Button>
          </form>
        </div>
      </div>
    </main>
  )

  const title = mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your workspace' : mode === 'reset' ? 'Choose a new password' : 'Reset your password'
  const subtitle = mode === 'signin' ? 'Sign in to continue to your operating system.' : mode === 'signup' ? 'Start organizing work in one connected place.' : mode === 'reset' ? 'Choose a new password for your account.' : 'We will send a secure reset link to your email.'
  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-foreground p-10 text-background lg:flex">
        <div className="text-lg font-semibold tracking-tight">Nexus<span className="text-primary">Flow</span></div>
        <div className="max-w-md">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">The intelligent operating system</p>
          <h2 className="text-5xl font-semibold leading-[1.05] tracking-tight">Move from busywork to momentum.</h2>
          <p className="mt-6 text-sm leading-7 text-background/60">Projects, knowledge, automation, and AI connected in one calm workspace for teams that move fast.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-background/60"><ShieldCheck className="size-4 text-primary" /> Enterprise-ready governance by default</div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center justify-between lg:hidden"><strong className="text-lg tracking-tight">Nexus<span className="text-primary">Flow</span></strong><Link href="/" className="text-sm text-muted-foreground">Home</Link></div>
          <div className="mb-8">
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><LockKeyhole className="size-5" /></span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {mode === 'signup' && <label className="flex flex-col gap-1.5 text-sm font-medium">Your name<input value={name} onChange={e=>setName(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>}
            {mode !== 'reset' && <label className="flex flex-col gap-1.5 text-sm font-medium">Work email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>}
            {mode !== 'forgot' && mode !== 'reset' && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">Password
                <div className="flex items-center rounded-md border border-border focus-within:ring-2 focus-within:ring-ring">
                  <input type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 outline-none" />
                  <button type="button" onClick={()=>setShowPassword(v=>!v)} className="px-3 text-muted-foreground" aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button>
                </div>
              </label>
            )}
            {mode === 'reset' && <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" className="rounded-md border border-border bg-background px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">Confirm new password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" className="rounded-md border border-border bg-background px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            </>}
            {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
            {message&&<p role="status" className="text-sm text-emerald-600">{message}</p>}
            <Button disabled={loading} type="submit">{loading&&<Loader2 className="animate-spin" data-icon="inline-start"/>}{mode==='forgot'?'Send reset link':mode==='reset'?'Update password':mode==='signin'?'Sign in':'Create account'} <ArrowRight data-icon="inline-end" /></Button>
          </form>
          <div className="mt-6 flex flex-wrap gap-2 text-sm text-muted-foreground">{mode==='signin'?<><span>New to NexusFlow?</span><button type="button" onClick={()=>setMode('signup')} className="font-medium text-primary">Create an account</button><button type="button" onClick={()=>{setMessage('');setMode('forgot')}} className="basis-full text-left text-xs hover:text-foreground">Forgot your password?</button></>:<button type="button" onClick={()=>setMode('signin')} className="font-medium text-primary">Back to sign in</button>}</div>
        </div>
      </section>
    </main>
  )
}

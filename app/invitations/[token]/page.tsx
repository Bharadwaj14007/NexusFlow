import Link from 'next/link'
import { notFound } from 'next/navigation'
import InvitationAcceptance from '@/components/workspace/invitation-acceptance'
import { getAuthContext } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[a-f0-9]{64}$/i.test(token)) notFound()
  const context = await getAuthContext()

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Organization invitation</p>
        <h1 className="mt-3 text-2xl font-semibold">Join your team</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">Sign in or create an account using the email address that received this invitation.</p>
        {context
          ? <InvitationAcceptance token={token} email={context.user.email} />
          : <Link href={`/auth?invite=${token}`} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Sign in or create account</Link>}
      </section>
    </main>
  )
}

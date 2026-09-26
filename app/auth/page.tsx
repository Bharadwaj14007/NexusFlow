import { redirect } from 'next/navigation'
import AuthScreen from '@/components/auth/auth-screen'
import { getAuthContext } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite = '' } = await searchParams
  const ctx = await getAuthContext()
  if (ctx && /^[a-f0-9]{64}$/i.test(invite)) redirect(`/invitations/${invite}`)
  if (ctx?.organization) redirect('/workspace')

  return (
    <AuthScreen
      initialMode={ctx ? 'onboarding' : 'signin'}
      defaultName={ctx?.user.name ?? 'Alex Morgan'}
      inviteToken={/^[a-f0-9]{64}$/i.test(invite) ? invite : ''}
    />
  )
}

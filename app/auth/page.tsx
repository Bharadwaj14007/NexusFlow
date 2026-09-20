import { redirect } from 'next/navigation'
import AuthScreen from '@/components/auth/auth-screen'
import { getAuthContext } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

export default async function AuthPage() {
  const ctx = await getAuthContext()
  if (ctx?.organization) redirect('/workspace')

  return (
    <AuthScreen
      initialMode={ctx ? 'onboarding' : 'signin'}
      defaultName={ctx?.user.name ?? 'Alex Morgan'}
    />
  )
}

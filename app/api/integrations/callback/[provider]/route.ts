import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'
import { completeIntegrationOAuth, integrationOAuthCookieName, isOAuthProvider, oauthCookieOptions } from '@/lib/services/integration.service'

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const base = process.env.APP_URL ?? new URL(request.url).origin
  const url = new URL('/workspace?integration=error', base)
  const providerName = provider.toUpperCase()
  if (!isOAuthProvider(providerName)) return NextResponse.redirect(url)
  const query = new URL(request.url).searchParams
  const state = query.get('state')
  const code = query.get('code')
  if (query.has('error') || !state || !code) {
    const response = NextResponse.redirect(url)
    response.cookies.set(integrationOAuthCookieName(providerName), '', { ...oauthCookieOptions(), maxAge: 0 })
    return response
  }
  try {
    const cookieStore = await cookies()
    const cookieName = integrationOAuthCookieName(providerName)
    await completeIntegrationOAuth(providerName, code, state, cookieStore.get(cookieName)?.value, new URL(request.url).origin)
    url.search = '?integration=connected'
  } catch (error) {
    if (!(error instanceof AppError)) {
      console.error('Integration authorization callback failed.', { provider, errorName: error instanceof Error ? error.name : 'UnknownError' })
    }
  }
  const response = NextResponse.redirect(url)
  response.cookies.set(integrationOAuthCookieName(providerName), '', { ...oauthCookieOptions(), maxAge: 0 })
  return response
}

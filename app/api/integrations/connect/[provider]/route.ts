import { NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'
import { oauthCookieOptions, startIntegrationOAuth } from '@/lib/services/integration.service'

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params
    const result = await startIntegrationOAuth(provider.toUpperCase(), new URL(request.url).origin)
    const response = NextResponse.redirect(result.url)
    response.cookies.set(result.cookieName, result.nonce, oauthCookieOptions())
    return response
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Unable to start integration authorization.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to connect this integration.' }, { status: 500 })
  }
}

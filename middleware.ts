import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'

export function middleware(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/workspace/:path*'],
}

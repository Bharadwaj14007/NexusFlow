import { createHash, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/constants'

export function generateSessionToken() {
  return randomBytes(32).toString('hex')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function readSessionToken() {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function createUserSession(userId: string, organizationId?: string | null) {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  const requestHeaders = await headers()

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      currentOrganizationId: organizationId ?? null,
      expiresAt,
      userAgent: requestHeaders.get('user-agent')?.slice(0, 500) ?? null,
    },
  })

  await setSessionCookie(token)
  return token
}

export async function destroyCurrentSession() {
  const token = await readSessionToken()
  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    })
  }
  await clearSessionCookie()
}

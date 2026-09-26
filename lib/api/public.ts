import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export type ApiKeyContext = {
  apiKeyId: string
  organizationId: string
  rateLimitRemaining: number
}

export async function authenticatePublicApi(request: Request): Promise<ApiKeyContext> {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : request.headers.get('x-api-key')
  if (!token || token.length > 200) throw new AppError('UNAUTHORIZED', 'A valid API key is required.', 401)

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash(token) },
    select: { id: true, organizationId: true, expiresAt: true },
  })
  const now = new Date()
  if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt <= now)) {
    throw new AppError('UNAUTHORIZED', 'A valid API key is required.', 401)
  }

  const windowStart = new Date(now)
  windowStart.setUTCSeconds(0, 0)
  const bucket = await prisma.apiRateLimitBucket.upsert({
    where: { apiKeyId_windowStart: { apiKeyId: apiKey.id, windowStart } },
    create: { apiKeyId: apiKey.id, windowStart, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
    select: { requestCount: true },
  })
  if (bucket.requestCount > 120) throw new AppError('RATE_LIMITED', 'API rate limit exceeded. Try again next minute.', 429)

  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: now } })
  return { apiKeyId: apiKey.id, organizationId: apiKey.organizationId, rateLimitRemaining: Math.max(0, 120 - bucket.requestCount) }
}

export async function withPublicApi<T>(
  request: Request,
  action: (context: ApiKeyContext) => Promise<T>,
) {
  try {
    const context = await authenticatePublicApi(request)
    const response = NextResponse.json({ data: await action(context) })
    response.headers.set('X-RateLimit-Limit', '120')
    response.headers.set('X-RateLimit-Remaining', String(context.rateLimitRemaining))
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
    }
    if (error instanceof AppError) {
      const response = NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
      if (error.status === 429) {
        response.headers.set('X-RateLimit-Limit', '120')
        response.headers.set('X-RateLimit-Remaining', '0')
        response.headers.set('Retry-After', String(60 - new Date().getUTCSeconds()))
      }
      return response
    }
    console.error('Public API request failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to process API request.' }, { status: 500 })
  }
}

export function pagination(request: Request) {
  const url = new URL(request.url)
  const parseInteger = (value: string | null, fallback: number) => {
    if (value === null || !/^-?\d+$/.test(value)) return fallback
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : fallback
  }
  const limit = Math.min(100, Math.max(1, parseInteger(url.searchParams.get('limit'), 50)))
  const offset = Math.min(1_000_000, Math.max(0, parseInteger(url.searchParams.get('offset'), 0)))
  return { limit, offset }
}

export function apiSearch(request: Request) {
  const url = new URL(request.url)
  const query = z.string().trim().max(100).optional().parse(url.searchParams.get('search') ?? undefined)
  return query || undefined
}

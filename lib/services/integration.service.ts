import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { IntegrationProvider, IntegrationStatus, MembershipRole, Prisma } from '@prisma/client'
import { z } from 'zod'
import { getAuthContext } from '@/lib/auth/context'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'

const oauthProviders = ['SLACK', 'GITHUB', 'GOOGLE', 'LINEAR'] as const
type OAuthProvider = typeof oauthProviders[number]
type ProviderConfig = { clientId: string; clientSecret: string; authorizeUrl: string; tokenUrl: string; revokeUrl: string; scope: string }
type OAuthState = { provider: OAuthProvider; organizationId: string; userId: string; nonce: string; expiresAt: number }
type OAuthToken = { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string }
const stateSchema = z.object({
  provider: z.enum(oauthProviders),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  nonce: z.string().min(20),
  expiresAt: z.number().int(),
})
const adminRoles: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN]

function encryptionKey() {
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!configured || configured.length < 32) {
    throw new AppError('CONFIGURATION', 'Set INTEGRATION_ENCRYPTION_KEY to a random value of at least 32 characters.', 503)
  }
  return createHash('sha256').update(configured).digest()
}

function providerConfig(provider: OAuthProvider): ProviderConfig | null {
  if (provider === 'SLACK') {
    const clientId = process.env.SLACK_CLIENT_ID
    const clientSecret = process.env.SLACK_CLIENT_SECRET
    return clientId && clientSecret ? { clientId, clientSecret, authorizeUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access', revokeUrl: 'https://slack.com/api/auth.revoke', scope: 'chat:write' } : null
  }
  if (provider === 'GITHUB') {
    const clientId = process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET
    return clientId && clientSecret ? { clientId, clientSecret, authorizeUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', revokeUrl: 'https://api.github.com/applications/:client_id/token', scope: 'repo read:user' } : null
  }
  if (provider === 'GOOGLE') {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    return clientId && clientSecret ? { clientId, clientSecret, authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', revokeUrl: 'https://oauth2.googleapis.com/revoke', scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly' } : null
  }
  const clientId = process.env.LINEAR_CLIENT_ID
  const clientSecret = process.env.LINEAR_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret, authorizeUrl: 'https://linear.app/oauth/authorize', tokenUrl: 'https://api.linear.app/oauth/token', revokeUrl: 'https://api.linear.app/oauth/revoke', scope: 'read,write' } : null
}

function requireManagerContext() {
  return getAuthContext().then((context) => {
    if (!context) throw new AppError('UNAUTHORIZED', 'Sign in to manage integrations.', 401)
    if (!context.organization || !context.membership) throw new AppError('FORBIDDEN', 'Select an organization first.', 403)
    if (!adminRoles.includes(context.membership.role)) throw new AppError('FORBIDDEN', 'Only organization owners and admins can manage integrations.', 403)
    return { ...context, organization: context.organization, membership: context.membership }
  })
}

function cookieName(provider: OAuthProvider) {
  return `nxf_oauth_${provider.toLowerCase()}_nonce`
}

export function integrationOAuthCookieName(provider: string) {
  return cookieName(z.enum(oauthProviders).parse(provider))
}

export async function listIntegrations() {
  const context = await requireManagerContext()
  const connected = await prisma.integration.findMany({
    where: { organizationId: context.organization.id },
    select: { provider: true, status: true, config: true, lastCheckedAt: true, updatedAt: true },
  })
  return {
    providers: [...oauthProviders].map((provider) => {
      const integration = connected.find((item) => item.provider === provider)
      const metadata = integration?.config as { accountName?: string; accountId?: string } | undefined
      return {
        provider,
        configured: providerConfig(provider) !== null && Boolean(process.env.INTEGRATION_ENCRYPTION_KEY),
        status: integration?.status ?? IntegrationStatus.DISCONNECTED,
        accountName: metadata?.accountName ?? null,
        accountId: metadata?.accountId ?? null,
        lastCheckedAt: integration?.lastCheckedAt ?? null,
      }
    }),
  }
}

export async function startIntegrationOAuth(providerInput: string, origin: string) {
  const provider = z.enum(oauthProviders).parse(providerInput)
  const context = await requireManagerContext()
  const config = providerConfig(provider)
  if (!config) throw new AppError('CONFIGURATION', `Configure the ${provider} OAuth client credentials to connect this provider.`, 503)
  encryptionKey()
  const nonce = randomBytes(32).toString('base64url')
  const payload: OAuthState = {
    provider,
    organizationId: context.organization.id,
    userId: context.user.id,
    nonce,
    expiresAt: Date.now() + 10 * 60_000,
  }
  const state = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', encryptionKey()).update(state).digest('base64url')
  const stateToken = `${state}.${signature}`
  const redirectUri = new URL(`/api/integrations/callback/${provider.toLowerCase()}`, process.env.APP_URL ?? origin).toString()
  const authorization = new URL(config.authorizeUrl)
  authorization.searchParams.set('client_id', config.clientId)
  authorization.searchParams.set('redirect_uri', redirectUri)
  authorization.searchParams.set('response_type', 'code')
  authorization.searchParams.set('scope', config.scope)
  authorization.searchParams.set('state', stateToken)
  if (provider === 'GOOGLE') {
    authorization.searchParams.set('access_type', 'offline')
    authorization.searchParams.set('prompt', 'consent')
  }
  return { url: authorization.toString(), state: stateToken, nonce, cookieName: cookieName(provider), redirectUri }
}

function readState(token: string, nonceCookie: string | undefined, provider: OAuthProvider) {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw new AppError('VALIDATION', 'Invalid integration authorization state.', 400)
  const expected = createHmac('sha256', encryptionKey()).update(payload).digest()
  let received: Buffer
  try { received = Buffer.from(signature, 'base64url') } catch { throw new AppError('VALIDATION', 'Invalid integration authorization state.', 400) }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new AppError('VALIDATION', 'Invalid integration authorization state.', 400)
  let parsed: OAuthState
  try { parsed = stateSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))) } catch { throw new AppError('VALIDATION', 'Invalid integration authorization state.', 400) }
  const nonceBytes = Buffer.from(parsed.nonce)
  const cookieBytes = Buffer.from(nonceCookie ?? '')
  if (parsed.provider !== provider || parsed.expiresAt <= Date.now() || nonceBytes.length !== cookieBytes.length || !timingSafeEqual(nonceBytes, cookieBytes)) {
    throw new AppError('FORBIDDEN', 'Integration authorization expired or failed validation.', 403)
  }
  return parsed
}

function encrypt(value: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.')
}

function decrypt(value: string): OAuthToken {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  if (!iv || !tag || !ciphertext) throw new AppError('CONFIGURATION', 'Stored integration credentials are invalid.', 500)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as OAuthToken
}

async function exchangeCode(provider: OAuthProvider, code: string, redirectUri: string, config: ProviderConfig) {
  const form = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: redirectUri })
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': provider === 'SLACK' ? 'application/json' : 'application/x-www-form-urlencoded' },
    body: provider === 'SLACK' ? JSON.stringify(Object.fromEntries(form)) : form.toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new AppError('UPSTREAM', `${provider} authorization could not be completed.`, 502)
  const token = await response.json() as OAuthToken & { ok?: boolean; error?: string }
  if (!token.access_token || token.ok === false) throw new AppError('UPSTREAM', `${provider} did not issue an access token.`, 502)
  return token
}

async function verifyAccount(provider: OAuthProvider, token: OAuthToken) {
  const response = provider === 'SLACK'
    ? await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) })
    : provider === 'GITHUB'
      ? await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(10_000) })
      : provider === 'GOOGLE'
        ? await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) })
        : await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: token.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ viewer { id name email } }' }), signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new AppError('UPSTREAM', `${provider} account verification failed.`, 502)
  const result = await response.json() as Record<string, unknown>
  if (provider === 'SLACK' && result.ok !== true) throw new AppError('UPSTREAM', 'Slack account verification failed.', 502)
  const account = provider === 'SLACK'
    ? { accountId: String(result.team_id ?? result.user_id ?? ''), accountName: String(result.team ?? result.user ?? 'Slack workspace') }
    : provider === 'GITHUB'
      ? { accountId: String(result.id ?? ''), accountName: String(result.login ?? 'GitHub account') }
      : provider === 'GOOGLE'
        ? { accountId: String(result.id ?? ''), accountName: String(result.email ?? result.name ?? 'Google account') }
        : (() => {
            const viewer = (result.data as { viewer?: { id?: string; name?: string; email?: string } } | undefined)?.viewer
            return { accountId: viewer?.id ?? '', accountName: viewer?.name ?? viewer?.email ?? 'Linear account' }
          })()
  if (!account.accountId) throw new AppError('UPSTREAM', `${provider} returned no verified account identity.`, 502)
  return account
}

export async function completeIntegrationOAuth(providerInput: string, code: string, stateToken: string, nonceCookie: string | undefined, origin: string) {
  const provider = z.enum(oauthProviders).parse(providerInput)
  const state = readState(stateToken, nonceCookie, provider)
  const context = await requireManagerContext()
  if (context.organization.id !== state.organizationId || context.user.id !== state.userId) {
    throw new AppError('FORBIDDEN', 'The signed-in account or organization changed during authorization.', 403)
  }
  const config = providerConfig(provider)
  if (!config) throw new AppError('CONFIGURATION', `Configure the ${provider} OAuth client credentials before connecting.`, 503)
  const redirectUri = new URL(`/api/integrations/callback/${provider.toLowerCase()}`, process.env.APP_URL ?? origin).toString()
  const token = await exchangeCode(provider, code, redirectUri, config)
  const account = await verifyAccount(provider, token)
  const data = {
    organizationId: state.organizationId,
    provider: provider as IntegrationProvider,
    status: IntegrationStatus.CONNECTED,
    config: account as Prisma.InputJsonValue,
    credentialsEncrypted: encrypt(token),
    lastCheckedAt: new Date(),
  }
  await prisma.integration.upsert({
    where: { organizationId_provider: { organizationId: state.organizationId, provider: data.provider } },
    create: data,
    update: { status: data.status, config: data.config, credentialsEncrypted: data.credentialsEncrypted, lastCheckedAt: data.lastCheckedAt },
  })
  await prisma.auditLog.create({ data: { organizationId: state.organizationId, actorId: context.user.id, action: 'integration.connected', entityType: 'Integration', metadata: { provider, accountId: account.accountId } } })
}

export async function testIntegration(providerInput: string) {
  const provider = z.enum(oauthProviders).parse(providerInput)
  const context = await requireManagerContext()
  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: context.organization.id, provider } },
    select: { id: true, credentialsEncrypted: true },
  })
  if (!integration?.credentialsEncrypted) throw new AppError('NOT_FOUND', 'Integration is not connected.', 404)
  try {
    const account = await verifyAccount(provider, decrypt(integration.credentialsEncrypted))
    await prisma.integration.update({ where: { id: integration.id }, data: { status: IntegrationStatus.CONNECTED, config: account, lastCheckedAt: new Date() } })
    return { provider, ...account, status: IntegrationStatus.CONNECTED }
  } catch (error) {
    await prisma.integration.update({ where: { id: integration.id }, data: { status: IntegrationStatus.ERROR, lastCheckedAt: new Date() } })
    throw error
  }
}

export async function disconnectIntegration(providerInput: string) {
  const provider = z.enum(oauthProviders).parse(providerInput)
  const context = await requireManagerContext()
  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: context.organization.id, provider } },
    select: { id: true, credentialsEncrypted: true },
  })
  if (!integration?.credentialsEncrypted) throw new AppError('NOT_FOUND', 'Integration is not connected.', 404)
  const config = providerConfig(provider)
  if (!config) throw new AppError('CONFIGURATION', 'Provider OAuth credentials are required to revoke this connection.', 503)
  const token = decrypt(integration.credentialsEncrypted)
  const headers = new Headers({ Accept: 'application/json' })
  let body: string
  let url = config.revokeUrl
  let method = 'POST'
  if (provider === 'SLACK') {
    headers.set('Authorization', `Bearer ${token.access_token}`)
    body = new URLSearchParams({ token: token.access_token }).toString()
    headers.set('Content-Type', 'application/x-www-form-urlencoded')
  } else if (provider === 'GITHUB') {
    headers.set('Authorization', `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`)
    headers.set('Content-Type', 'application/json')
    method = 'DELETE'
    url = config.revokeUrl.replace(':client_id', encodeURIComponent(config.clientId))
    body = JSON.stringify({ access_token: token.access_token })
  } else {
    headers.set('Content-Type', 'application/x-www-form-urlencoded')
    body = provider === 'GOOGLE'
      ? new URLSearchParams({ token: token.access_token }).toString()
      : new URLSearchParams({ token: token.access_token, client_id: config.clientId, client_secret: config.clientSecret }).toString()
  }
  const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    console.error('OAuth provider token revocation failed.', { provider, status: response.status })
    throw new AppError('UPSTREAM', `Unable to revoke the ${provider} authorization.`, 502)
  }
  if (provider === 'SLACK') {
    const result = await response.json() as { ok?: boolean }
    if (result.ok !== true) throw new AppError('UPSTREAM', 'Slack did not confirm token revocation.', 502)
  }
  await prisma.integration.delete({ where: { id: integration.id } })
  await prisma.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: 'integration.disconnected', entityType: 'Integration', metadata: { provider } } })
  return { provider, status: IntegrationStatus.DISCONNECTED }
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (oauthProviders as readonly string[]).includes(value)
}

export function oauthCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/integrations/callback', maxAge: 600 }
}

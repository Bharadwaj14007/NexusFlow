import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { getAuthContext } from '@/lib/auth/context'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { createUserSession, destroyCurrentSession, hashSessionToken, readSessionToken } from '@/lib/auth/session'
import { getMembershipsForUser } from '@/lib/auth/memberships'
import { initialsFromName } from '@/lib/utils/identity'
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema, sessionIdSchema, signInSchema, signUpSchema } from '@/lib/validation/auth'
import { createOrganizationForUser } from '@/lib/services/organization.service'
import { getWorkflowEmailProvider } from '@/lib/services/email.provider'

const resetTokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function signUp(input: unknown) {
  const data = signUpSchema.parse(input)
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    throw new AppError('CONFLICT', 'An account with this email already exists.')
  }

  let user
  try {
    user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: hashPassword(data.password),
        avatarInitials: initialsFromName(data.name),
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('CONFLICT', 'An account with this email already exists.')
    }
    throw error
  }

  await createUserSession(user.id, null)
  return { userId: user.id, needsOrganization: true }
}

export async function signIn(input: unknown) {
  const data = signInSchema.parse(input)
  const user = await prisma.user.findUnique({ where: { email: data.email } })
  if (!user || !verifyPassword(data.password, user.passwordHash)) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password.', 401)
  }

  const memberships = await getMembershipsForUser(user.id)
  await createUserSession(user.id, memberships[0]?.organizationId ?? null)
  return { userId: user.id, needsOrganization: memberships.length === 0 }
}

export async function signOut() {
  await destroyCurrentSession()
}

export async function requestPasswordReset(input: unknown) {
  const { email } = forgotPasswordSchema.parse(input)
  const provider = getWorkflowEmailProvider()
  if (!provider) throw new AppError('CONFIGURATION', 'Password recovery email is not configured.', 503)

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } })
  if (!user) return { accepted: true }

  const recentResetCount = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } },
  })
  if (recentResetCount >= 3) return { accepted: true }

  const token = randomBytes(32).toString('hex')
  const tokenHash = resetTokenHash(token)
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) },
  })
  try {
    const origin = process.env.APP_URL ?? 'http://localhost:3000'
    await provider.send({
      to: user.email,
      subject: 'Reset your NexusFlow password',
      body: `Hello ${user.name}, use this secure link to reset your password within 30 minutes:\n\n${origin}/auth/reset?token=${token}\n\nIf you did not request this, you can ignore this email.`,
    })
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } })
    console.error('Password reset email delivery failed.', error instanceof Error ? error.name : 'Unknown error')
    return { accepted: true }
  }
  return { accepted: true }
}

export async function resetPassword(input: unknown) {
  const data = resetPasswordSchema.parse(input)
  const tokenHash = resetTokenHash(data.token)
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    })
    if (!token) throw new AppError('VALIDATION', 'This password reset link is invalid or expired.', 400)
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (!claimed.count) throw new AppError('VALIDATION', 'This password reset link is invalid or expired.', 400)
    await tx.user.update({ where: { id: token.userId }, data: { passwordHash: hashPassword(data.password) } })
    await tx.session.deleteMany({ where: { userId: token.userId } })
    await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, id: { not: token.id } } })
  })
  await destroyCurrentSession()
  return { ok: true }
}

export async function changePassword(input: unknown) {
  const ctx = await getAuthContext()
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Sign in to continue.', 401)
  const data = changePasswordSchema.parse(input)
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { passwordHash: true } })
  if (!user || !verifyPassword(data.currentPassword, user.passwordHash)) {
    throw new AppError('UNAUTHORIZED', 'Current password is incorrect.', 401)
  }
  const token = await readSessionToken()
  await prisma.$transaction([
    prisma.user.update({ where: { id: ctx.user.id }, data: { passwordHash: hashPassword(data.password) } }),
    prisma.session.deleteMany({ where: { userId: ctx.user.id, ...(token ? { tokenHash: { not: hashSessionToken(token) } } : {}) } }),
  ])
  return { ok: true }
}

export async function listCurrentUserSessions() {
  const ctx = await getAuthContext()
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Sign in to continue.', 401)
  const token = await readSessionToken()
  const currentHash = token ? hashSessionToken(token) : ''
  return prisma.session.findMany({
    where: { userId: ctx.user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
    select: { id: true, tokenHash: true, userAgent: true, createdAt: true, lastActiveAt: true, expiresAt: true },
  }).then((sessions) => sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === currentHash })))
}

export async function revokeUserSession(input: unknown) {
  const ctx = await getAuthContext()
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Sign in to continue.', 401)
  const { id } = sessionIdSchema.parse(input)
  const currentSession = await prisma.session.findFirst({ where: { id: ctx.sessionId, userId: ctx.user.id }, select: { id: true } })
  if (currentSession?.id === id) throw new AppError('VALIDATION', 'Use sign out to revoke the current session.', 400)
  const result = await prisma.session.deleteMany({ where: { id, userId: ctx.user.id } })
  if (!result.count) throw new AppError('NOT_FOUND', 'Session not found.', 404)
  return { ok: true }
}

export async function revokeOtherUserSessions() {
  const ctx = await getAuthContext()
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Sign in to continue.', 401)
  await prisma.session.deleteMany({ where: { userId: ctx.user.id, id: { not: ctx.sessionId } } })
  return { ok: true }
}

export async function completeOnboarding(input: {
  name: string
  organizationName: string
  organizationType?: string
}) {
  const ctx = await getAuthContext()
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Sign in to continue.', 401)

  const name = input.name.trim()
  await prisma.user.update({
    where: { id: ctx.user.id },
    data: {
      name,
      avatarInitials: initialsFromName(name),
    },
  })

  if (ctx.organization) return { organizationId: ctx.organization.id }

  const organization = await createOrganizationForUser({
    userId: ctx.user.id,
    sessionId: ctx.sessionId,
    name: input.organizationName,
    type: input.organizationType,
  })

  return { organizationId: organization.id }
}

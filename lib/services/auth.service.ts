import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { getAuthContext } from '@/lib/auth/context'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { createUserSession, destroyCurrentSession } from '@/lib/auth/session'
import { getMembershipsForUser } from '@/lib/auth/memberships'
import { initialsFromName } from '@/lib/utils/identity'
import { signInSchema, signUpSchema } from '@/lib/validation/auth'
import { createOrganizationForUser } from '@/lib/services/organization.service'

export async function signUp(input: unknown) {
  const data = signUpSchema.parse(input)
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    throw new AppError('CONFLICT', 'An account with this email already exists.')
  }

  const localName = data.email.split('@')[0] ?? 'Member'
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: localName,
      passwordHash: hashPassword(data.password),
      avatarInitials: initialsFromName(localName),
    },
  })

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

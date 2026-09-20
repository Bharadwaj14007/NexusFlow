import { MembershipRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getMembershipsForUser, resolveCurrentOrganization } from '@/lib/auth/memberships'
import { hashSessionToken, readSessionToken } from '@/lib/auth/session'

export type PublicUser = {
  id: string
  email: string
  name: string
  avatarInitials: string | null
}

export type AuthContext = {
  sessionId: string
  user: PublicUser
  organization: {
    id: string
    name: string
    slug: string
    type: string | null
  } | null
  membership: {
    id: string
    role: MembershipRole
  } | null
  organizations: {
    id: string
    name: string
    slug: string
    type: string | null
    role: MembershipRole
  }[]
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const token = await readSessionToken()
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  })

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined)
    }
    return null
  }

  const memberships = await getMembershipsForUser(session.userId)
  const current = resolveCurrentOrganization(memberships, session.currentOrganizationId)

  if (current?.organization.id !== session.currentOrganizationId) {
    await prisma.session.update({
      where: { id: session.id },
      data: { currentOrganizationId: current?.organization.id ?? null },
    })
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarInitials: session.user.avatarInitials,
    },
    organization: current
      ? {
          id: current.organization.id,
          name: current.organization.name,
          slug: current.organization.slug,
          type: current.organization.type,
        }
      : null,
    membership: current ? { id: current.id, role: current.role } : null,
    organizations: memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      type: membership.organization.type,
      role: membership.role,
    })),
  }
}

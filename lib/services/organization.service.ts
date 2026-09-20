import { MembershipRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { getAuthContext } from '@/lib/auth/context'
import { slugify } from '@/lib/utils/identity'
import { createOrganizationSchema, switchOrganizationSchema, updateOrganizationSchema } from '@/lib/validation/auth'

export async function createOrganizationForUser(input: {
  userId: string
  sessionId: string
  name: string
  type?: string
}) {
  const slug = await uniqueOrganizationSlug(input.name)

  return prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name: input.name.trim(),
        slug,
        type: input.type?.trim() || 'Technology',
        memberships: {
          create: {
            userId: input.userId,
            role: MembershipRole.OWNER,
          },
        },
        auditLogs: {
          create: {
            actorId: input.userId,
            action: 'organization.created',
            entityType: 'Organization',
            metadata: { name: input.name.trim() },
          },
        },
      },
    })

    await tx.session.update({
      where: { id: input.sessionId },
      data: { currentOrganizationId: created.id },
    })

    return created
  })
}

async function uniqueOrganizationSlug(name: string) {
  const base = slugify(name)
  let slug = base
  let n = 1
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1
    slug = `${base}-${n}`
  }
  return slug
}

export async function createOrganization(input: unknown) {
  const data = createOrganizationSchema.parse(input)
  const ctx = await getAuthContext()
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Sign in to continue.', 401)

  return createOrganizationForUser({
    userId: ctx.user.id,
    sessionId: ctx.sessionId,
    name: data.name,
    type: data.type,
  })
}

export async function switchOrganization(input: unknown) {
  const data = switchOrganizationSchema.parse(input)
  const ctx = await getAuthContext()
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Sign in to continue.', 401)

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: ctx.user.id,
        organizationId: data.organizationId,
      },
    },
  })

  if (!membership) {
    throw new AppError('FORBIDDEN', 'You are not a member of that organization.', 403)
  }

  await prisma.session.update({
    where: { id: ctx.sessionId },
    data: { currentOrganizationId: membership.organizationId },
  })

  return { organizationId: membership.organizationId }
}

export async function updateCurrentOrganization(input: unknown) {
  const data = updateOrganizationSchema.parse(input)
  const ctx = await getAuthContext()
  if (!ctx?.organization || !ctx.membership) {
    throw new AppError('UNAUTHORIZED', 'Select an organization to continue.', 401)
  }

  if (ctx.membership.role !== MembershipRole.OWNER && ctx.membership.role !== MembershipRole.ADMIN) {
    throw new AppError('FORBIDDEN', 'You do not have permission to update this organization.', 403)
  }

  return prisma.organization.update({
    where: { id: ctx.organization.id },
    data: {
      name: data.name,
      type: data.type?.trim() || ctx.organization.type,
    },
  })
}

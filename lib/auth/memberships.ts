import { prisma } from '@/lib/db'

export async function getMembershipsForUser(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  })
}

export function resolveCurrentOrganization(
  memberships: Awaited<ReturnType<typeof getMembershipsForUser>>,
  currentOrganizationId?: string | null,
) {
  if (memberships.length === 0) return null
  return memberships.find((membership) => membership.organizationId === currentOrganizationId) ?? memberships[0] ?? null
}

import { prisma } from '@/lib/db'
import { withPublicApi, pagination } from '@/lib/api/public'

export async function GET(request: Request) {
  return withPublicApi(request, async ({ organizationId }) => {
    const { limit, offset } = pagination(request)
    const where = { organizationId, status: { not: 'ARCHIVED' as const } }
    const [items, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        select: { id: true, name: true, description: true, status: true, schedule: true, scheduleTime: true, scheduleDay: true, createdAt: true, updatedAt: true },
      }),
      prisma.workflow.count({ where }),
    ])
    return { items, total, limit, offset, hasMore: offset + items.length < total }
  })
}

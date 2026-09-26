import { prisma } from '@/lib/db'
import { withPublicApi, pagination } from '@/lib/api/public'

export async function GET(request: Request) {
  return withPublicApi(request, async ({ organizationId }) => {
    const { limit, offset } = pagination(request)
    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: { id: true, name: true, status: true, sizeBytes: true, mimeType: true, createdAt: true, updatedAt: true },
      }),
      prisma.document.count({ where: { organizationId } }),
    ])
    return { items, total, limit, offset, hasMore: offset + items.length < total }
  })
}

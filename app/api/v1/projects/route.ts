import { prisma } from '@/lib/db'
import { createProjectSchema, projectStatusSchema } from '@/lib/validation/projects-tasks'
import { withPublicApi, pagination, apiSearch } from '@/lib/api/public'
import { AppError } from '@/lib/errors'
import { assertPlanCapacity } from '@/lib/services/plan-limits'
import { enqueueWorkflowEvent } from '@/lib/services/workflow-engine'

export async function GET(request: Request) {
  return withPublicApi(request, async ({ organizationId }) => {
    const { limit, offset } = pagination(request)
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const query = apiSearch(request)
    const where = {
      organizationId,
      archivedAt: null,
      ...(status ? { status: projectStatusSchema.parse(status) } : {}),
      ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { description: { contains: query, mode: 'insensitive' as const } }] } : {}),
    }
    const [items, total] = await Promise.all([
      prisma.project.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: offset, take: limit }),
      prisma.project.count({ where }),
    ])
    return { items, total, limit, offset, hasMore: offset + items.length < total }
  })
}

export async function POST(request: Request) {
  return withPublicApi(request, async ({ organizationId }) => {
    let input: unknown
    try { input = await request.json() } catch { throw new AppError('VALIDATION', 'Request body must be valid JSON.', 400) }
    const data = createProjectSchema.parse(input)
    await assertPlanCapacity(organizationId, 'projects')
    const memberIds = [...new Set([...data.memberIds, data.ownerId].filter((id): id is string => Boolean(id)))]
    if (memberIds.length) {
      const memberships = await prisma.membership.count({ where: { organizationId, userId: { in: memberIds } } })
      if (memberships !== memberIds.length) throw new AppError('VALIDATION', 'Project members must belong to this organization.', 400)
    }
    const { memberIds: _, ...values } = data
    const project = await prisma.project.create({
      data: {
        ...values,
        organizationId,
        members: { create: memberIds.map((userId) => ({ organizationId, userId })) },
      },
    })
    try {
      await enqueueWorkflowEvent({
        organizationId,
        trigger: 'PROJECT_CREATED',
        entityId: project.id,
        eventId: `project.created:${project.id}:${project.createdAt.toISOString()}`,
        payload: { projectId: project.id, status: project.status, priority: project.priority },
      })
    } catch (error) {
      console.error('Public API project created but workflow event could not be queued.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    }
    return project
  })
}

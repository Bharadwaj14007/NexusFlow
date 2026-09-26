import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { withPublicApi, pagination, apiSearch } from '@/lib/api/public'
import { createTaskSchema, taskStatusSchema } from '@/lib/validation/projects-tasks'
import { assertPlanCapacity } from '@/lib/services/plan-limits'
import { enqueueWorkflowEvent } from '@/lib/services/workflow-engine'
import { z } from 'zod'

export async function GET(request: Request) {
  return withPublicApi(request, async ({ organizationId }) => {
    const { limit, offset } = pagination(request)
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const projectId = url.searchParams.get('projectId')
      ? z.string().uuid().parse(url.searchParams.get('projectId'))
      : null
    const query = apiSearch(request)
    const where = {
      organizationId,
      archivedAt: null,
      ...(status ? { status: taskStatusSchema.parse(status) } : {}),
      ...(projectId ? { projectId } : {}),
      ...(query ? { OR: [{ title: { contains: query, mode: 'insensitive' as const } }, { description: { contains: query, mode: 'insensitive' as const } }] } : {}),
    }
    const [items, total] = await Promise.all([
      prisma.task.findMany({ where, orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }], skip: offset, take: limit, include: { project: { select: { id: true, name: true } } } }),
      prisma.task.count({ where }),
    ])
    return { items, total, limit, offset, hasMore: offset + items.length < total }
  })
}

export async function POST(request: Request) {
  return withPublicApi(request, async ({ organizationId }) => {
    let input: unknown
    try { input = await request.json() } catch { throw new AppError('VALIDATION', 'Request body must be valid JSON.', 400) }
    const data = createTaskSchema.parse(input)
    await assertPlanCapacity(organizationId, 'tasks')
    const project = await prisma.project.findFirst({ where: { id: data.projectId, organizationId, archivedAt: null }, select: { id: true } })
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.', 404)
    if (data.assigneeId) {
      const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: data.assigneeId, organizationId } }, select: { id: true } })
      if (!membership) throw new AppError('VALIDATION', 'Assignee must belong to this organization.', 400)
    }
    const latest = await prisma.task.aggregate({ where: { organizationId, projectId: data.projectId }, _max: { position: true } })
    const task = await prisma.task.create({
      data: {
        ...data,
        organizationId,
        position: (latest._max.position ?? 0) + 1,
      },
    })
    try {
      await enqueueWorkflowEvent({
        organizationId,
        trigger: 'TASK_CREATED',
        entityId: task.id,
        eventId: `task.created:${task.id}`,
        payload: { taskId: task.id, projectId: task.projectId, status: task.status, priority: task.priority, assigneeId: task.assigneeId, dueAt: task.dueAt?.toISOString() ?? null, title: task.title, description: task.description },
      })
    } catch (error) {
      console.error('Public API task created but workflow event could not be queued.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    }
    return task
  })
}

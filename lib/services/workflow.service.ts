import { Prisma, WorkflowStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireOrganization, requirePermission } from '@/lib/auth/guards'
import { AppError } from '@/lib/errors'
import {
  createWorkflowSchema,
  testWorkflowSchema,
  updateWorkflowSchema,
  workflowDefinitionSchema,
  workflowExecutionIdSchema,
  workflowExecutionQuerySchema,
  workflowIdSchema,
} from '@/lib/validation/workflows'
import { runWorkflowEvent, testWorkflowDefinition } from '@/lib/services/workflow-engine'
import { assertPlanCapacity } from '@/lib/services/plan-limits'

export async function listWorkflows() {
  const ctx = await requireOrganization()
  return prisma.workflow.findMany({
    where: { organizationId: ctx.organization.id, status: { not: WorkflowStatus.ARCHIVED } },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { executions: true } } },
  })
}

export async function listWorkflowExecutions(input: unknown = {}) {
  const ctx = await requireOrganization()
  const query = workflowExecutionQuerySchema.parse(input)
  return prisma.workflowExecution.findMany({
    where: { organizationId: ctx.organization.id, ...(query.workflowId ? { workflowId: query.workflowId } : {}), ...(query.status ? { status: query.status } : {}) },
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: { workflow: { select: { name: true } } },
  })
}

export async function workflowExecutionSummary() {
  const ctx = await requireOrganization()
  const grouped = await prisma.workflowExecution.groupBy({
    by: ['status'],
    where: { organizationId: ctx.organization.id },
    _count: { _all: true },
  })
  return Object.fromEntries(grouped.map((item) => [item.status, item._count._all]))
}

export async function replayWorkflowExecution(input: unknown) {
  const ctx = await requirePermission('workflows:execute')
  const { id } = workflowExecutionIdSchema.parse(input)
  const execution = await prisma.workflowExecution.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!execution) throw new AppError('NOT_FOUND', 'Execution not found.', 404)
  if (execution.status !== 'FAILED') throw new AppError('VALIDATION', 'Only failed executions can be replayed.', 400)
  return prisma.workflowExecution.update({
    where: { id: execution.id },
    data: {
      status: 'QUEUED',
      retryCount: 0,
      error: null,
      finishedAt: null,
      queuedAt: new Date(),
      nextAttemptAt: new Date(),
    },
  })
}

export async function cancelWorkflowExecution(input: unknown) {
  const ctx = await requirePermission('workflows:execute')
  const { id } = workflowExecutionIdSchema.parse(input)
  const result = await prisma.workflowExecution.updateMany({
    where: { id, organizationId: ctx.organization.id, status: { in: ['QUEUED', 'PROCESSING'] } },
    data: { status: 'CANCELLED', finishedAt: new Date(), error: 'Cancelled by an organization member.' },
  })
  if (!result.count) throw new AppError('NOT_FOUND', 'Queued or processing execution not found.', 404)
  return { ok: true }
}

export async function createWorkflow(input: unknown) {
  const ctx = await requirePermission('workflows:create')
  const data = createWorkflowSchema.parse(input)
  await assertPlanCapacity(ctx.organization.id, 'workflows')
  return prisma.workflow.create({
    data: {
      organizationId: ctx.organization.id,
      createdById: ctx.user.id,
      name: data.name,
      description: data.description,
      definition: data.definition as Prisma.InputJsonValue,
      status: data.publish ? WorkflowStatus.ACTIVE : WorkflowStatus.DRAFT,
      schedule: data.schedule?.frequency ?? 'NONE',
      scheduleTime: data.schedule?.time,
      scheduleDay: data.schedule?.day,
      scheduleTimezone: data.schedule?.timezone ?? 'UTC',
    },
  })
}

export async function updateWorkflow(input: unknown) {
  const ctx = await requirePermission('workflows:update')
  const data = updateWorkflowSchema.parse(input)
  const current = await prisma.workflow.findFirst({ where: { id: data.id, organizationId: ctx.organization.id } })
  if (!current) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  const definition = data.definition ? workflowDefinitionSchema.parse(data.definition) : undefined
  return prisma.workflow.update({
    where: { id: current.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(definition ? { definition: definition as Prisma.InputJsonValue } : {}),
      ...(data.publish !== undefined ? { status: data.publish ? WorkflowStatus.ACTIVE : WorkflowStatus.DRAFT } : {}),
      ...(data.schedule ? {
        schedule: data.schedule.frequency,
        scheduleTime: data.schedule.time,
        scheduleDay: data.schedule.day,
        scheduleTimezone: data.schedule.timezone,
      } : {}),
    },
  })
}

export async function setWorkflowStatus(input: unknown) {
  const ctx = await requirePermission('workflows:update')
  const data = workflowIdSchema.extend({ active: z.boolean() }).parse(input)
  const workflow = await prisma.workflow.findFirst({ where: { id: data.id, organizationId: ctx.organization.id } })
  if (!workflow) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  return prisma.workflow.update({ where: { id: workflow.id }, data: { status: data.active ? WorkflowStatus.ACTIVE : WorkflowStatus.PAUSED } })
}

export async function duplicateWorkflow(input: unknown) {
  const ctx = await requirePermission('workflows:create')
  const { id } = workflowIdSchema.parse(input)
  const source = await prisma.workflow.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!source) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  return prisma.workflow.create({ data: { organizationId: ctx.organization.id, createdById: ctx.user.id, name: `${source.name} (copy)`, description: source.description, definition: source.definition as Prisma.InputJsonValue, status: WorkflowStatus.DRAFT, schedule: 'NONE' } })
}

export async function deleteWorkflow(input: unknown) {
  const ctx = await requirePermission('workflows:delete')
  const { id } = workflowIdSchema.parse(input)
  const result = await prisma.workflow.deleteMany({ where: { id, organizationId: ctx.organization.id } })
  if (!result.count) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  return { ok: true }
}

export async function testWorkflow(input: unknown) {
  const ctx = await requirePermission('workflows:execute')
  const data = testWorkflowSchema.parse(input)
  const workflow = await prisma.workflow.findFirst({ where: { id: data.workflowId, organizationId: ctx.organization.id } })
  if (!workflow) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  const definition = workflowDefinitionSchema.parse(workflow.definition)
  if (data.payload && Object.keys(data.payload).length) return testWorkflowDefinition(definition, data.payload)
  if (definition.trigger === 'SCHEDULED') return testWorkflowDefinition(definition, { scheduled: true, timezone: workflow.scheduleTimezone ?? 'UTC' })

  if (['TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_OVERDUE', 'COMMENT_ADDED'].includes(definition.trigger)) {
    const task = await prisma.task.findFirst({
      where: {
        organizationId: ctx.organization.id,
        archivedAt: null,
        ...(data.entityId ? { id: data.entityId } : {}),
        ...(definition.trigger === 'TASK_COMPLETED' ? { status: 'DONE' } : {}),
        ...(definition.trigger === 'TASK_OVERDUE' ? { status: { not: 'DONE' }, dueAt: { lt: new Date() } } : {}),
        ...(definition.trigger === 'COMMENT_ADDED' ? { comments: { some: { organizationId: ctx.organization.id } } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, projectId: true, status: true, priority: true, assigneeId: true, dueAt: true, title: true, description: true },
    })
    if (!task) throw new AppError('NOT_FOUND', 'No organization task matches this workflow trigger to test.', 404)
    const payload: Record<string, unknown> = {
      taskId: task.id,
      projectId: task.projectId,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueAt: task.dueAt?.toISOString() ?? null,
      title: task.title,
      description: task.description,
    }
    if (definition.trigger === 'COMMENT_ADDED') {
      const comment = await prisma.comment.findFirst({
        where: { taskId: task.id, organizationId: ctx.organization.id },
        orderBy: { createdAt: 'desc' },
        select: { body: true, authorId: true },
      })
      if (!comment) throw new AppError('NOT_FOUND', 'No organization comment is available to test this workflow.', 404)
      payload.body = comment.body
      payload.actorId = comment.authorId
    }
    return testWorkflowDefinition(definition, payload)
  }

  const project = await prisma.project.findFirst({
    where: { organizationId: ctx.organization.id, archivedAt: null, ...(data.entityId ? { id: data.entityId } : {}) },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, description: true, status: true, priority: true, ownerId: true },
  })
  if (!project) throw new AppError('NOT_FOUND', 'No organization project is available to test this workflow.', 404)
  return testWorkflowDefinition(definition, {
    projectId: project.id,
    title: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    assigneeId: project.ownerId,
  })
}

export async function executeWorkflowEvent(input: unknown) {
  const ctx = await requirePermission('workflows:execute')
  if (ctx.organization.id !== (input as { organizationId?: string }).organizationId) throw new AppError('FORBIDDEN', 'Invalid organization.', 403)
  return runWorkflowEvent(input)
}

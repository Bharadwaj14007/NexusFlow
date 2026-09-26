import { Prisma, WorkflowExecutionStatus, WorkflowStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { workflowDefinitionSchema, workflowEventSchema, type workflowActionSchema } from '@/lib/validation/workflows'
import { AppError } from '@/lib/errors'
import { getWorkflowEmailProvider } from '@/lib/services/email.provider'
import { assertPlanCapacity } from '@/lib/services/plan-limits'
import { z } from 'zod'

type Definition = ReturnType<typeof workflowDefinitionSchema.parse>
type Action = ReturnType<typeof workflowActionSchema.parse>
const workflowEventWithOrganizationSchema = workflowEventSchema.extend({ organizationId: z.string().uuid() })

function valueFor(field: string, payload: Record<string, unknown>) { return payload[field] }
function matches(definition: Definition, payload: Record<string, unknown>) {
  return definition.conditions.every((condition) => {
    const actual = valueFor(condition.field, payload)
    if (condition.operator === 'is_set') return actual !== undefined && actual !== null && actual !== ''
    if (condition.operator === 'is_not_set') return actual === undefined || actual === null || actual === ''
    if (condition.operator === 'contains') return String(actual ?? '').toLowerCase().includes(String(condition.value ?? '').toLowerCase())
    if (condition.operator === 'not_equals') return String(actual ?? '') !== String(condition.value ?? '')
    return String(actual ?? '') === String(condition.value ?? '')
  })
}

function eventLineage(payload: Record<string, unknown>, workflowId: string) {
  const depth = typeof payload.__workflowDepth === 'number' ? payload.__workflowDepth : 0
  const prior = Array.isArray(payload.__workflowChain) ? payload.__workflowChain.filter((id): id is string => typeof id === 'string') : []
  return { depth: depth + 1, chain: [...prior, workflowId] }
}

async function enqueueActionEvent(input: {
  organizationId: string
  workflowId: string
  idempotencyKey: string
  trigger: string
  entityId: string
  actorId?: string
  payload: Record<string, unknown>
}) {
  const lineage = eventLineage(input.payload, input.workflowId)
  if (lineage.depth > 5) return
  await enqueueWorkflowEvent({
    organizationId: input.organizationId,
    trigger: input.trigger,
    entityId: input.entityId,
    actorId: input.actorId,
    eventId: `workflow-action:${input.idempotencyKey}`,
    depth: lineage.depth,
    payload: { ...input.payload, __workflowDepth: lineage.depth, __workflowChain: lineage.chain },
  })
}

async function createIdempotent<T>(create: () => Promise<T>, lookup: () => Promise<T | null>) {
  try {
    return await create()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await lookup()
      if (existing) return existing
    }
    throw error
  }
}

async function executeAction(
  action: Action,
  organizationId: string,
  actorId: string | undefined,
  payload: Record<string, unknown>,
  workflow: { id: string; createdById: string | null },
  idempotencyKey: string,
) {
  const effectiveActorId = actorId ?? workflow.createdById ?? undefined
  if (action.type === 'CREATE_TASK') {
    if (!action.projectId || !action.title) throw new AppError('VALIDATION', 'Create task actions require a project and title.', 400)
    const project = await prisma.project.findFirst({ where: { id: action.projectId, organizationId, archivedAt: null }, select: { id: true } })
    if (!project) throw new AppError('NOT_FOUND', 'Workflow target project not found.', 404)
    if (action.assigneeId) {
      const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: action.assigneeId, organizationId } }, select: { id: true } })
      if (!membership) throw new AppError('VALIDATION', 'Workflow assignee must belong to the organization.', 400)
    }
    let task = await prisma.task.findUnique({ where: { workflowActionKey: idempotencyKey } })
    if (!task) {
      await assertPlanCapacity(organizationId, 'tasks')
      const latest = await prisma.task.aggregate({ where: { organizationId, projectId: project.id }, _max: { position: true } })
      task = await createIdempotent(
        () => prisma.task.create({ data: {
          organizationId,
          projectId: project.id,
          creatorId: effectiveActorId,
          assigneeId: action.assigneeId ?? null,
          title: action.title!,
          description: action.description ?? '',
          priority: action.priority ?? 'MEDIUM',
          status: action.status ?? 'TODO',
          labels: [],
          position: (latest._max.position ?? 0) + 1,
          workflowActionKey: idempotencyKey,
        } }),
        () => prisma.task.findUnique({ where: { workflowActionKey: idempotencyKey } }),
      )
    }
    if (task.assigneeId && task.assigneeId !== effectiveActorId) {
      await createIdempotent(
        () => prisma.notification.create({ data: { organizationId, userId: task.assigneeId!, type: 'TASK', title: 'Task assigned', body: `You were assigned to ${task.title}.`, workflowActionKey: `${idempotencyKey}:assignee-notice` } }),
        () => prisma.notification.findUnique({ where: { workflowActionKey: `${idempotencyKey}:assignee-notice` } }),
      )
    }
    await enqueueActionEvent({
      organizationId, workflowId: workflow.id, idempotencyKey, trigger: 'TASK_CREATED', entityId: task.id, actorId: effectiveActorId,
      payload: { ...payload, taskId: task.id, projectId: task.projectId, actorId: effectiveActorId, status: task.status, priority: task.priority, assigneeId: task.assigneeId, dueAt: task.dueAt?.toISOString() ?? null, title: task.title, description: task.description },
    })
    return { id: task.id }
  }
  if (action.type === 'UPDATE_TASK') {
    if (!action.taskId) throw new AppError('VALIDATION', 'Update task actions require a task.', 400)
    const existing = await prisma.task.findFirst({ where: { id: action.taskId, organizationId }, select: { id: true, status: true, projectId: true } })
    if (!existing) throw new AppError('NOT_FOUND', 'Workflow target task not found.', 404)
    if (action.assigneeId) {
      const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: action.assigneeId, organizationId } }, select: { id: true } })
      if (!membership) throw new AppError('VALIDATION', 'Workflow assignee must belong to the organization.', 400)
    }
    const task = await prisma.task.update({
      where: { id: existing.id },
      data: { ...(action.status ? { status: action.status } : {}), ...(action.priority ? { priority: action.priority } : {}), ...(action.assigneeId !== undefined ? { assigneeId: action.assigneeId } : {}) },
    })
    const trigger = action.status === 'DONE' ? 'TASK_COMPLETED' : 'TASK_UPDATED'
    await enqueueActionEvent({
      organizationId, workflowId: workflow.id, idempotencyKey, trigger, entityId: task.id, actorId: effectiveActorId,
      payload: { ...payload, taskId: task.id, projectId: task.projectId, actorId: effectiveActorId, status: task.status, priority: task.priority, assigneeId: task.assigneeId, dueAt: task.dueAt?.toISOString() ?? null, title: task.title, description: task.description },
    })
    return { id: task.id }
  }
  if (action.type === 'ADD_COMMENT') {
    if (!action.taskId || !action.body) throw new AppError('VALIDATION', 'Comment actions require a task and body.', 400)
    const task = await prisma.task.findFirst({ where: { id: action.taskId, organizationId }, select: { id: true, projectId: true } })
    if (!task) throw new AppError('NOT_FOUND', 'Workflow target task not found.', 404)
    const authorId = effectiveActorId
    if (!authorId || !(await prisma.membership.findUnique({ where: { userId_organizationId: { userId: authorId, organizationId } }, select: { id: true } }))) {
      throw new AppError('VALIDATION', 'Workflow comment requires an organization member as its author.', 400)
    }
    const comment = await createIdempotent(
      () => prisma.comment.create({ data: { organizationId, taskId: task.id, authorId, body: action.body!, workflowActionKey: idempotencyKey } }),
      () => prisma.comment.findUnique({ where: { workflowActionKey: idempotencyKey } }),
    )
    await enqueueActionEvent({
      organizationId, workflowId: workflow.id, idempotencyKey, trigger: 'COMMENT_ADDED', entityId: task.id, actorId: authorId,
      payload: { ...payload, taskId: task.id, projectId: task.projectId, actorId: authorId, body: comment.body },
    })
    return { id: comment.id }
  }
  if (action.type === 'CREATE_NOTIFICATION') {
    const userId = action.userId ?? effectiveActorId ?? String(payload.actorId ?? '')
    if (!userId) throw new AppError('VALIDATION', 'Notification actions require a user.', 400)
    if (!(await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId } }, select: { id: true } }))) {
      throw new AppError('VALIDATION', 'Workflow notification recipient must belong to the organization.', 400)
    }
    const notification = await createIdempotent(
      () => prisma.notification.create({ data: { organizationId, userId, title: action.title ?? 'Workflow notification', body: action.body ?? action.description ?? '', type: 'INFO', workflowActionKey: idempotencyKey } }),
      () => prisma.notification.findUnique({ where: { workflowActionKey: idempotencyKey } }),
    )
    return { id: notification.id }
  }
  const provider = getWorkflowEmailProvider()
  if (!provider) throw new AppError('EMAIL_NOT_CONFIGURED', 'Email provider is not configured.', 503)
  if (!action.to || !action.subject || !action.body) throw new AppError('VALIDATION', 'Email actions require recipient, subject, and body.', 400)
  await provider.send({ to: action.to, subject: action.subject, body: action.body, idempotencyKey })
  return { sent: true }
}

export async function enqueueWorkflowEvent(input: unknown) {
  const event = workflowEventWithOrganizationSchema.parse(input)
  const depth = typeof event.payload.__workflowDepth === 'number' ? event.payload.__workflowDepth : event.depth ?? 0
  const chain = Array.isArray(event.payload.__workflowChain) ? event.payload.__workflowChain.filter((id): id is string => typeof id === 'string') : []
  if (depth > 5) return []
  const workflows = await prisma.workflow.findMany({ where: { organizationId: event.organizationId, status: WorkflowStatus.ACTIVE } })
  const queued = []
  for (const workflow of workflows) {
    if (chain.includes(workflow.id)) continue
    const definition = workflowDefinitionSchema.safeParse(workflow.definition)
    if (!definition.success || definition.data.trigger !== event.trigger || !matches(definition.data, event.payload)) continue
    const idempotencyKey = `${event.eventId ?? `${event.trigger}:${event.entityId}`}:${workflow.id}`
    const execution = await prisma.workflowExecution.upsert({
      where: { organizationId_idempotencyKey: { organizationId: event.organizationId, idempotencyKey } },
      create: { organizationId: event.organizationId, workflowId: workflow.id, trigger: event.trigger, idempotencyKey, status: WorkflowExecutionStatus.QUEUED, queuedAt: new Date(), nextAttemptAt: new Date(), result: { payload: event.payload } as Prisma.InputJsonValue },
      update: {},
    })
    queued.push(execution)
  }
  return queued
}

export async function processWorkflowJobs(limit = 25) {
  await prisma.workflowExecution.updateMany({
    where: {
      status: WorkflowExecutionStatus.PROCESSING,
      processingAt: { lt: new Date(Date.now() - 15 * 60_000) },
    },
    data: {
      status: WorkflowExecutionStatus.QUEUED,
      nextAttemptAt: new Date(),
      error: 'Recovered after a stale worker lease.',
    },
  })
  const jobs = await prisma.workflowExecution.findMany({ where: { status: WorkflowExecutionStatus.QUEUED, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] }, orderBy: { queuedAt: 'asc' }, take: limit })
  const results = []
  for (const job of jobs) {
    const claimed = await prisma.workflowExecution.updateMany({ where: { id: job.id, status: WorkflowExecutionStatus.QUEUED }, data: { status: WorkflowExecutionStatus.PROCESSING, processingAt: new Date(), startedAt: job.startedAt ?? new Date() } })
    if (!claimed.count) continue
    const workflow = await prisma.workflow.findFirst({ where: { id: job.workflowId, organizationId: job.organizationId } })
    try {
      if (!workflow) throw new AppError('NOT_FOUND', 'Workflow no longer exists.', 404)
      const definition = workflowDefinitionSchema.parse(workflow.definition)
      if (!matches(definition, (job.result as { payload?: Record<string, unknown> } | null)?.payload ?? {})) throw new AppError('VALIDATION', 'Workflow conditions no longer match.', 400)
      const payload = (job.result as { payload?: Record<string, unknown> } | null)?.payload ?? {}
      const savedActions = Array.isArray((job.result as { actions?: unknown[] } | null)?.actions)
        ? [...(job.result as { actions: unknown[] }).actions]
        : []
      const actorId = typeof payload.actorId === 'string' ? payload.actorId : undefined
      for (let index = savedActions.length; index < definition.actions.length; index += 1) {
        const actionResult = await executeAction(definition.actions[index], job.organizationId, actorId, payload, workflow, `${job.id}:${index}`)
        savedActions.push({ actionIndex: index, ...actionResult })
        await prisma.workflowExecution.update({
          where: { id: job.id },
          data: { result: { payload, actions: savedActions } as Prisma.InputJsonValue },
        })
      }
      const actions = savedActions
      results.push(await prisma.workflowExecution.update({ where: { id: job.id }, data: { status: WorkflowExecutionStatus.COMPLETED, finishedAt: new Date(), result: { payload, actions } as Prisma.InputJsonValue } }))
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Workflow action failed due to an internal server error.'
      if (!(error instanceof AppError)) console.error('Workflow execution failed.', { workflowId: job.workflowId, executionId: job.id, errorName: error instanceof Error ? error.name : 'UnknownError' })
      const retryCount = job.retryCount + 1
      const retry = retryCount <= job.maxRetries
      results.push(await prisma.workflowExecution.update({ where: { id: job.id }, data: retry ? { status: WorkflowExecutionStatus.QUEUED, retryCount, nextAttemptAt: new Date(Date.now() + 2 ** retryCount * 60_000), error: message } : { status: WorkflowExecutionStatus.FAILED, retryCount, finishedAt: new Date(), error: message } }))
    }
  }
  return results
}

export async function runWorkflowEvent(input: unknown) {
  await enqueueWorkflowEvent(input)
  return processWorkflowJobs()
}

export async function scheduleDueWorkflows(now = new Date()) {
  const workflows = await prisma.workflow.findMany({ where: { status: WorkflowStatus.ACTIVE, schedule: { not: 'NONE' } } })
  const queued = []
  for (const workflow of workflows) {
    const time = workflow.scheduleTime ?? '00:00'
    const timezone = workflow.scheduleTimezone || 'UTC'
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const localDate = `${values.year}-${values.month}-${values.day}`
    const localTime = `${values.hour}:${values.minute}`
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday)
    const due = localTime >= time && (workflow.schedule === 'DAILY' || (workflow.schedule === 'WEEKLY' && weekday === workflow.scheduleDay))
    if (!due) continue
    const previousParts = workflow.lastScheduledAt
      ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(workflow.lastScheduledAt)
      : []
    const previousValues = Object.fromEntries(previousParts.map((part) => [part.type, part.value]))
    const previousDate = previousValues.year ? `${previousValues.year}-${previousValues.month}-${previousValues.day}` : null
    if (previousDate === localDate) continue
    queued.push(...await enqueueWorkflowEvent({
      organizationId: workflow.organizationId,
      trigger: 'SCHEDULED',
      entityId: workflow.id,
      payload: { scheduled: true, scheduledAt: now.toISOString(), timezone },
      eventId: `schedule:${workflow.id}:${localDate}:${time}:${timezone}`,
    }))
    await prisma.workflow.update({ where: { id: workflow.id }, data: { lastScheduledAt: now } })
  }
  return queued
}

export async function processOverdueTasks(now = new Date()) {
  const tasks = await prisma.task.findMany({
    where: { archivedAt: null, dueAt: { lt: now }, status: { not: 'DONE' } },
    orderBy: { dueAt: 'asc' },
    take: 500,
    select: { id: true, organizationId: true, projectId: true, assigneeId: true, status: true, priority: true, dueAt: true, title: true, description: true },
  })
  for (const task of tasks) await enqueueWorkflowEvent({ organizationId: task.organizationId, trigger: 'TASK_OVERDUE', entityId: task.id, eventId: `task.overdue:${task.id}:${task.dueAt?.toISOString()}`, payload: { ...task, dueAt: task.dueAt?.toISOString() ?? null } })
  return processWorkflowJobs()
}

export function testWorkflowDefinition(definition: Definition, payload: Record<string, unknown>) {
  const conditions = definition.conditions.map((condition) => ({ ...condition, passed: matches({ ...definition, conditions: [condition] }, payload) }))
  const conditionsMatch = conditions.every((condition) => condition.passed)
  const actions = definition.actions.map((action) => {
    const error = action.type === 'CREATE_TASK' && (!action.projectId || !action.title)
      ? 'Create task actions require a project and title.'
      : action.type === 'UPDATE_TASK' && !action.taskId
        ? 'Update task actions require a task.'
        : action.type === 'ADD_COMMENT' && (!action.taskId || !action.body)
          ? 'Comment actions require a task and body.'
          : action.type === 'SEND_EMAIL' && (!getWorkflowEmailProvider() || !action.to || !action.subject || !action.body)
            ? !getWorkflowEmailProvider() ? 'Email provider is not configured.' : 'Email actions require recipient, subject, and body.'
            : undefined
    return { ...action, wouldRun: conditionsMatch && !error, ...(error ? { error } : {}) }
  })
  return { trigger: definition.trigger, conditions, actions }
}

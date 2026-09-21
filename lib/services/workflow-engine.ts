import { Prisma, WorkflowExecutionStatus, WorkflowStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { workflowDefinitionSchema, workflowEventSchema, type workflowActionSchema } from '@/lib/validation/workflows'
import { AppError } from '@/lib/errors'
import { getWorkflowEmailProvider } from '@/lib/services/email.provider'

type Definition = ReturnType<typeof workflowDefinitionSchema.parse>
type Action = ReturnType<typeof workflowActionSchema.parse>
type Event = ReturnType<typeof workflowEventSchema.parse> & { organizationId: string }

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

async function executeAction(action: Action, organizationId: string, actorId: string | undefined, payload: Record<string, unknown>) {
  const service = await import('@/lib/services/project-task.service')
  if (action.type === 'CREATE_TASK') {
    if (!action.projectId || !action.title) throw new AppError('VALIDATION', 'Create task actions require a project and title.', 400)
    return service.createTask({ projectId: action.projectId, title: action.title, description: action.description ?? '', priority: action.priority ?? 'MEDIUM', assigneeId: action.assigneeId ?? null, status: action.status ?? 'TODO' })
  }
  if (action.type === 'UPDATE_TASK') {
    if (!action.taskId) throw new AppError('VALIDATION', 'Update task actions require a task.', 400)
    return service.updateTask({ id: action.taskId, ...(action.status ? { status: action.status } : {}), ...(action.priority ? { priority: action.priority } : {}), ...(action.assigneeId !== undefined ? { assigneeId: action.assigneeId } : {}) })
  }
  if (action.type === 'ADD_COMMENT') {
    if (!action.taskId || !action.body) throw new AppError('VALIDATION', 'Comment actions require a task and body.', 400)
    return service.addTaskComment({ taskId: action.taskId, body: action.body })
  }
  if (action.type === 'CREATE_NOTIFICATION') {
    const userId = action.userId ?? actorId ?? String(payload.actorId ?? '')
    if (!userId) throw new AppError('VALIDATION', 'Notification actions require a user.', 400)
    return prisma.notification.create({ data: { organizationId, userId, title: action.title ?? 'Workflow notification', body: action.body ?? action.description ?? '', type: 'INFO' } })
  }
  const provider = getWorkflowEmailProvider()
  if (!provider) throw new AppError('EMAIL_NOT_CONFIGURED', 'Email provider is not configured.', 503)
  if (!action.to || !action.subject || !action.body) throw new AppError('VALIDATION', 'Email actions require recipient, subject, and body.', 400)
  await provider.send({ to: action.to, subject: action.subject, body: action.body })
  return { sent: true }
}

export async function enqueueWorkflowEvent(input: unknown) {
  const event = input as Event
  const workflows = await prisma.workflow.findMany({ where: { organizationId: event.organizationId, status: WorkflowStatus.ACTIVE } })
  const queued = []
  for (const workflow of workflows) {
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
      const actions = []
      for (const action of definition.actions) actions.push(await executeAction(action, job.organizationId, String(payload.actorId ?? '') || undefined, payload))
      results.push(await prisma.workflowExecution.update({ where: { id: job.id }, data: { status: WorkflowExecutionStatus.COMPLETED, finishedAt: new Date(), result: { payload, actions } as Prisma.InputJsonValue } }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow action failed.'
      const retryCount = job.retryCount + 1
      const retry = retryCount <= job.maxRetries
      results.push(await prisma.workflowExecution.update({ where: { id: job.id }, data: retry ? { status: WorkflowExecutionStatus.QUEUED, retryCount, nextAttemptAt: new Date(Date.now() + 2 ** retryCount * 60_000), error: message } : { status: WorkflowExecutionStatus.FAILED, retryCount, finishedAt: new Date(), error: message } }))
    }
  }
  return results
}

export async function runWorkflowEvent(input: unknown) {
  const event = input as Event
  await enqueueWorkflowEvent(event)
  return processWorkflowJobs()
}

export async function scheduleDueWorkflows(now = new Date()) {
  const workflows = await prisma.workflow.findMany({ where: { status: WorkflowStatus.ACTIVE, schedule: { not: 'NONE' } } })
  const queued = []
  for (const workflow of workflows) {
    const time = workflow.scheduleTime ?? '00:00'
    const [hour, minute] = time.split(':').map(Number)
    const due = workflow.schedule === 'DAILY'
      ? now.getHours() === hour && now.getMinutes() === minute
      : workflow.schedule === 'WEEKLY' && now.getDay() === workflow.scheduleDay && now.getHours() === hour && now.getMinutes() === minute
    if (!due || (workflow.lastScheduledAt && now.getTime() - workflow.lastScheduledAt.getTime() < 50 * 60 * 1000)) continue
    const updated = await prisma.workflow.update({ where: { id: workflow.id }, data: { lastScheduledAt: now } })
    queued.push(...await enqueueWorkflowEvent({ organizationId: updated.organizationId, trigger: 'SCHEDULED', entityId: workflow.id, payload: { scheduled: true }, eventId: `schedule:${workflow.id}:${now.toISOString().slice(0, 16)}` }))
  }
  return queued
}

export async function processOverdueTasks(now = new Date()) {
  const tasks = await prisma.task.findMany({ where: { archivedAt: null, dueAt: { lt: now }, status: { not: 'DONE' } }, select: { id: true, organizationId: true, projectId: true, assigneeId: true, status: true, priority: true, dueAt: true, title: true, description: true } })
  for (const task of tasks) await enqueueWorkflowEvent({ organizationId: task.organizationId, trigger: 'TASK_OVERDUE', entityId: task.id, eventId: `task.overdue:${task.id}:${task.dueAt?.toISOString()}`, payload: { ...task, dueAt: task.dueAt?.toISOString() ?? null } })
  return processWorkflowJobs()
}

export function testWorkflowDefinition(definition: Definition, payload: Record<string, unknown>) {
  const conditions = definition.conditions.map((condition) => ({ ...condition, passed: matches({ ...definition, conditions: [condition] }, payload) }))
  return { trigger: definition.trigger, conditions, actions: definition.actions.map((action) => ({ ...action, wouldRun: conditions.every((condition) => condition.passed) })) }
}

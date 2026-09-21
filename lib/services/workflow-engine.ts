import { Prisma, WorkflowExecutionStatus, WorkflowStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { workflowDefinitionSchema, workflowEventSchema, type workflowActionSchema } from '@/lib/validation/workflows'
import { AppError } from '@/lib/errors'

type Definition = ReturnType<typeof workflowDefinitionSchema.parse>
type Action = ReturnType<typeof workflowActionSchema.parse>

function valueFor(field: string, payload: Record<string, unknown>) {
  return payload[field] ?? (field === 'projectId' ? payload.projectId : undefined)
}

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
  if (action.type === 'CREATE_TASK') {
    if (!action.projectId || !action.title) throw new AppError('VALIDATION', 'Create task actions require a project and title.', 400)
    const service = await import('@/lib/services/project-task.service')
    return service.createTask({ projectId: action.projectId, title: action.title, description: action.description ?? '', priority: action.priority ?? 'MEDIUM', assigneeId: action.assigneeId ?? null, status: action.status ?? 'TODO' })
  }
  if (action.type === 'UPDATE_TASK') {
    if (!action.taskId) throw new AppError('VALIDATION', 'Update task actions require a task.', 400)
    const service = await import('@/lib/services/project-task.service')
    return service.updateTask({ id: action.taskId, ...(action.status ? { status: action.status } : {}), ...(action.priority ? { priority: action.priority } : {}), ...(action.assigneeId !== undefined ? { assigneeId: action.assigneeId } : {}) })
  }
  if (action.type === 'ADD_COMMENT') {
    if (!action.taskId || !action.body) throw new AppError('VALIDATION', 'Comment actions require a task and body.', 400)
    const service = await import('@/lib/services/project-task.service')
    return service.addTaskComment({ taskId: action.taskId, body: action.body })
  }
  if (action.type === 'CREATE_NOTIFICATION') {
    const userId = action.userId ?? actorId ?? String(payload.actorId ?? '')
    if (!userId) throw new AppError('VALIDATION', 'Notification actions require a user.', 400)
    return prisma.notification.create({ data: { organizationId, userId, title: action.title ?? 'Workflow notification', body: action.body ?? action.description ?? '', type: 'INFO' } })
  }
}

export async function runWorkflowEvent(input: unknown) {
  const event = workflowEventSchema.parse(input)
  if (event.depth >= 3) return { skipped: true, reason: 'Maximum workflow depth reached.' }
  const workflows = await prisma.workflow.findMany({ where: { organizationId: event.organizationId, status: WorkflowStatus.ACTIVE } })
  const results = []
  for (const workflow of workflows) {
    const definition = workflowDefinitionSchema.safeParse(workflow.definition)
    if (!definition.success || definition.data.trigger !== event.trigger || !matches(definition.data, event.payload)) continue
    const idempotencyKey = `${event.eventId ?? `${event.trigger}:${event.entityId}`}:${workflow.id}`
    const existing = await prisma.workflowExecution.findFirst({ where: { organizationId: event.organizationId, workflowId: workflow.id, idempotencyKey } })
    if (existing) continue
    const execution = await prisma.workflowExecution.create({ data: { organizationId: event.organizationId, workflowId: workflow.id, trigger: event.trigger, idempotencyKey, status: WorkflowExecutionStatus.RUNNING, result: { payload: event.payload } as Prisma.InputJsonValue } })
    try {
      const actionResults = []
      for (const action of definition.data.actions) actionResults.push(await executeAction(action, event.organizationId, event.actorId, event.payload))
      const finished = await prisma.workflowExecution.update({ where: { id: execution.id }, data: { status: WorkflowExecutionStatus.SUCCEEDED, finishedAt: new Date(), result: { payload: event.payload, actions: actionResults } as Prisma.InputJsonValue } })
      results.push(finished)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow action failed.'
      const failed = await prisma.workflowExecution.update({ where: { id: execution.id }, data: { status: WorkflowExecutionStatus.FAILED, finishedAt: new Date(), error: message } })
      results.push(failed)
      if (process.env.NODE_ENV !== 'test') console.error(`Workflow ${workflow.id} failed: ${message}`)
    }
  }
  return results
}

export function testWorkflowDefinition(definition: Definition, payload: Record<string, unknown>) {
  const conditions = definition.conditions.map((condition) => ({ ...condition, passed: matches({ ...definition, conditions: [condition] }, payload) }))
  return { trigger: definition.trigger, conditions, actions: definition.actions.map((action) => ({ ...action, wouldRun: conditions.every((condition) => condition.passed) })) }
}

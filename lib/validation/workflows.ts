import { z } from 'zod'

export const workflowTriggerSchema = z.enum([
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_OVERDUE',
  'PROJECT_CREATED',
  'COMMENT_ADDED',
  'SCHEDULED',
])

export const workflowFieldSchema = z.enum(['priority', 'status', 'projectId', 'assigneeId', 'dueAt', 'title', 'description'])
export const workflowOperatorSchema = z.enum(['equals', 'not_equals', 'contains', 'is_set', 'is_not_set'])
export const workflowActionTypeSchema = z.enum(['CREATE_TASK', 'UPDATE_TASK', 'ADD_COMMENT', 'CREATE_NOTIFICATION', 'SEND_EMAIL'])
export const workflowScheduleSchema = z.object({
  frequency: z.enum(['NONE', 'DAILY', 'WEEKLY']).default('NONE'),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  day: z.number().int().min(0).max(6).optional(),
})

export const workflowConditionSchema = z.object({
  field: workflowFieldSchema,
  operator: workflowOperatorSchema,
  value: z.string().max(500).optional(),
})

export const workflowActionSchema = z.object({
  type: workflowActionTypeSchema,
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  taskId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).optional(),
  body: z.string().trim().max(5000).optional(),
  userId: z.string().uuid().optional(),
  to: z.string().email().optional(),
  subject: z.string().max(200).optional(),
})

export const workflowDefinitionSchema = z.object({
  trigger: workflowTriggerSchema,
  conditions: z.array(workflowConditionSchema).max(20).default([]),
  actions: z.array(workflowActionSchema).min(1).max(20),
})

export const workflowIdSchema = z.object({ id: z.string().uuid() })
export const createWorkflowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(''),
  definition: workflowDefinitionSchema,
  schedule: workflowScheduleSchema.optional(),
  publish: z.boolean().default(false),
})
export const updateWorkflowSchema = createWorkflowSchema.partial().extend({ id: z.string().uuid() })
export const workflowEventSchema = z.object({
  trigger: workflowTriggerSchema,
  entityId: z.string().uuid(),
  actorId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  depth: z.number().int().min(0).max(5).default(0),
  eventId: z.string().min(1).max(200).optional(),
})
export const testWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  entityId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
})

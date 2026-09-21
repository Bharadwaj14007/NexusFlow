import { MembershipRole, Prisma, WorkflowStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireOrganization, requireRole } from '@/lib/auth/guards'
import { AppError } from '@/lib/errors'
import {
  createWorkflowSchema,
  testWorkflowSchema,
  updateWorkflowSchema,
  workflowDefinitionSchema,
  workflowIdSchema,
} from '@/lib/validation/workflows'
import { runWorkflowEvent, testWorkflowDefinition } from '@/lib/services/workflow-engine'

const writers = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MEMBER]

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
  const query = input && typeof input === 'object' ? input as { workflowId?: string } : {}
  return prisma.workflowExecution.findMany({
    where: { organizationId: ctx.organization.id, ...(query.workflowId ? { workflowId: query.workflowId } : {}) },
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: { workflow: { select: { name: true } } },
  })
}

export async function createWorkflow(input: unknown) {
  const ctx = await requireRole(...writers)
  const data = createWorkflowSchema.parse(input)
  return prisma.workflow.create({
    data: {
      organizationId: ctx.organization.id,
      name: data.name,
      description: data.description,
      definition: data.definition as Prisma.InputJsonValue,
      status: data.publish ? WorkflowStatus.ACTIVE : WorkflowStatus.DRAFT,
    },
  })
}

export async function updateWorkflow(input: unknown) {
  const ctx = await requireRole(...writers)
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
    },
  })
}

export async function setWorkflowStatus(input: unknown) {
  const ctx = await requireRole(...writers)
  const data = workflowIdSchema.extend({ active: z.boolean() }).parse(input)
  const workflow = await prisma.workflow.findFirst({ where: { id: data.id, organizationId: ctx.organization.id } })
  if (!workflow) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  return prisma.workflow.update({ where: { id: workflow.id }, data: { status: data.active ? WorkflowStatus.ACTIVE : WorkflowStatus.PAUSED } })
}

export async function duplicateWorkflow(input: unknown) {
  const ctx = await requireRole(...writers)
  const { id } = workflowIdSchema.parse(input)
  const source = await prisma.workflow.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!source) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  return prisma.workflow.create({ data: { organizationId: ctx.organization.id, name: `${source.name} (copy)`, description: source.description, definition: source.definition as Prisma.InputJsonValue, status: WorkflowStatus.DRAFT } })
}

export async function deleteWorkflow(input: unknown) {
  const ctx = await requireRole(...writers)
  const { id } = workflowIdSchema.parse(input)
  const result = await prisma.workflow.deleteMany({ where: { id, organizationId: ctx.organization.id } })
  if (!result.count) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  return { ok: true }
}

export async function testWorkflow(input: unknown) {
  const ctx = await requireOrganization()
  const data = testWorkflowSchema.parse(input)
  const workflow = await prisma.workflow.findFirst({ where: { id: data.workflowId, organizationId: ctx.organization.id } })
  if (!workflow) throw new AppError('NOT_FOUND', 'Workflow not found.', 404)
  const definition = workflowDefinitionSchema.parse(workflow.definition)
  return testWorkflowDefinition(definition, data.payload)
}

export async function executeWorkflowEvent(input: unknown) {
  const ctx = await requireOrganization()
  if (ctx.organization.id !== (input as { organizationId?: string }).organizationId) throw new AppError('FORBIDDEN', 'Invalid organization.', 403)
  return runWorkflowEvent(input)
}

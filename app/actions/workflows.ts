'use server'

import { ZodError } from 'zod'
import { isAppError } from '@/lib/errors'
import * as service from '@/lib/services/workflow.service'

function result(error: unknown) {
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? 'Invalid workflow.' }
  if (isAppError(error)) return { error: error.message }
  throw error
}
function action(fn: (input: unknown) => Promise<unknown>) {
  return async (input: unknown = {}) => {
    try { return { ok: true as const, data: await fn(input) } } catch (error) { return result(error) }
  }
}
export const listWorkflowsAction = action(service.listWorkflows)
export const listWorkflowExecutionsAction = action(service.listWorkflowExecutions)
export const createWorkflowAction = action(service.createWorkflow)
export const updateWorkflowAction = action(service.updateWorkflow)
export const setWorkflowStatusAction = action(service.setWorkflowStatus)
export const duplicateWorkflowAction = action(service.duplicateWorkflow)
export const deleteWorkflowAction = action(service.deleteWorkflow)
export const testWorkflowAction = action(service.testWorkflow)

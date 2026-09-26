import assert from 'node:assert/strict'
import test from 'node:test'
import { SubscriptionPlan } from '@prisma/client'
import { pagination } from '../lib/api/public'
import { planLimits } from '../lib/services/plan-limits'
import { workflowDefinitionSchema, workflowScheduleSchema } from '../lib/validation/workflows'
import { testWorkflowDefinition } from '../lib/services/workflow-engine'

test('plan tiers expose bounded AI, seat, document, project, task, workflow, and key quotas', () => {
  assert.equal(planLimits[SubscriptionPlan.FREE].aiRequests, 100)
  assert.ok(planLimits[SubscriptionPlan.PRO].seats > planLimits[SubscriptionPlan.FREE].seats)
  assert.ok(planLimits[SubscriptionPlan.ENTERPRISE].tasks > planLimits[SubscriptionPlan.PRO].tasks)
})

test('workflow scheduling validates IANA timezone and required weekly fields', () => {
  assert.equal(workflowScheduleSchema.safeParse({ frequency: 'DAILY', time: '09:30', timezone: 'America/New_York' }).success, true)
  assert.equal(workflowScheduleSchema.safeParse({ frequency: 'WEEKLY', time: '09:30', timezone: 'UTC' }).success, false)
  assert.equal(workflowScheduleSchema.safeParse({ frequency: 'DAILY', time: '09:30', timezone: 'Mars/Olympus' }).success, false)
})

test('workflow definitions support multiple condition and action steps', () => {
  const result = workflowDefinitionSchema.safeParse({
    trigger: 'TASK_UPDATED',
    conditions: [
      { field: 'priority', operator: 'equals', value: 'URGENT' },
      { field: 'status', operator: 'not_equals', value: 'DONE' },
    ],
    actions: [
      { type: 'CREATE_NOTIFICATION', title: 'Urgent task', body: 'Please review this task.' },
      { type: 'UPDATE_TASK', taskId: '747644ad-8593-40e9-b82c-a3ea0e75df3d', status: 'IN_PROGRESS' },
    ],
  })
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.conditions.length, 2)
    assert.equal(result.data.actions.length, 2)
  }
})

test('workflow test preview reports condition results without running actions', () => {
  const definition = workflowDefinitionSchema.parse({
    trigger: 'TASK_UPDATED',
    conditions: [{ field: 'priority', operator: 'equals', value: 'URGENT' }],
    actions: [{ type: 'CREATE_NOTIFICATION', title: 'Escalate' }, { type: 'ADD_COMMENT', taskId: '747644ad-8593-40e9-b82c-a3ea0e75df3d', body: 'Please review' }],
  })
  const preview = testWorkflowDefinition(definition, { priority: 'URGENT' })
  assert.deepEqual(preview.conditions.map((condition) => condition.passed), [true])
  assert.deepEqual(preview.actions.map((action) => action.wouldRun), [true, true])
})

test('public API pagination normalizes unsafe, decimal, and out-of-range values', () => {
  assert.deepEqual(pagination(new Request('https://example.test/api/v1/tasks?limit=500&offset=-3')), { limit: 100, offset: 0 })
  assert.deepEqual(pagination(new Request('https://example.test/api/v1/tasks?limit=3.5&offset=9007199254740992')), { limit: 50, offset: 0 })
})

'use client'

import { useState } from 'react'
import { Copy, History, Play, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/workspace/automation-primitives'
import { cancelWorkflowExecutionAction, createWorkflowAction, deleteWorkflowAction, duplicateWorkflowAction, listWorkflowExecutionsAction, replayWorkflowExecutionAction, setWorkflowStatusAction, testWorkflowAction, updateWorkflowAction, workflowExecutionSummaryAction } from '@/app/actions/workflows'

type Workflow = { id: string; name: string; description: string; status: string; schedule: string; scheduleTime?: string | null; scheduleDay?: number | null; scheduleTimezone?: string; definition: Definition; _count: { executions: number } }
type WorkflowCondition = { field: string; operator: string; value?: string }
type WorkflowAction = { type: string; title?: string; body?: string; description?: string; projectId?: string; taskId?: string; userId?: string; to?: string; subject?: string; status?: string; priority?: string }
type Definition = { trigger: string; conditions: WorkflowCondition[]; actions: WorkflowAction[] }
type Execution = { id: string; trigger: string; status: string; retryCount: number; error: string | null; startedAt: string; workflow: { name: string } }
type WorkflowTestResult = { trigger: string; conditions: (WorkflowCondition & { passed: boolean })[]; actions: (WorkflowAction & { wouldRun: boolean; error?: string })[] }
const triggers = ['TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_OVERDUE', 'PROJECT_CREATED', 'COMMENT_ADDED', 'SCHEDULED']
const actions = ['CREATE_NOTIFICATION', 'ADD_COMMENT', 'CREATE_TASK', 'UPDATE_TASK', 'SEND_EMAIL']
const conditionFields = ['priority', 'status', 'projectId', 'assigneeId', 'dueAt', 'title', 'description']
const conditionOperators = ['equals', 'not_equals', 'contains', 'is_set', 'is_not_set']

function newAction(type = actions[0]): WorkflowAction {
  return { type }
}

export default function AutomationsView({ initialWorkflows }: { initialWorkflows: Workflow[] }) {
  const [workflows, setWorkflows] = useState(initialWorkflows)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [selected, setSelected] = useState<Workflow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null)
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState(triggers[0])
  const [workflowActions, setWorkflowActions] = useState<WorkflowAction[]>([newAction()])
  const [conditions, setConditions] = useState<WorkflowCondition[]>([])
  const [schedule, setSchedule] = useState('NONE')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [scheduleDay, setScheduleDay] = useState('1')
  const [scheduleTimezone, setScheduleTimezone] = useState('UTC')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [testResult, setTestResult] = useState<WorkflowTestResult | null>(null)
  const updateCondition = (index: number, changes: Partial<WorkflowCondition>) => {
    setConditions((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  }
  const updateActionAtIndex = (index: number, changes: Partial<WorkflowAction>) => {
    setWorkflowActions((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  }

  const refreshHistory = async () => {
    try {
      const [result, totals] = await Promise.all([listWorkflowExecutionsAction(), workflowExecutionSummaryAction()])
      if ('ok' in result) setExecutions(result.data as Execution[])
      else setError(result.error)
      if ('ok' in totals) setSummary(totals.data as Record<string, number>)
      else setError(totals.error)
    } catch {
      setError('Unable to load workflow execution history.')
    }
  }
  const save = async (publish: boolean) => {
    setLoading(true); setError('')
    try {
      const effectiveTrigger = schedule !== 'NONE' ? 'SCHEDULED' : trigger
      const definition = { trigger: effectiveTrigger, conditions, actions: workflowActions }
      const scheduleInput = { frequency: schedule, time: scheduleTime, day: Number(scheduleDay), timezone: scheduleTimezone }
      const result = selected
        ? await updateWorkflowAction({ id: selected.id, name: name || selected.name, definition, publish, schedule: scheduleInput })
        : await createWorkflowAction({ name: name || 'Untitled workflow', definition, publish, schedule: scheduleInput })
      if ('error' in result) { setError(result.error); return }
      const saved = result.data as Workflow
      setWorkflows(items => selected ? items.map(item => item.id === saved.id ? { ...item, ...saved, definition } : item) : [{ ...saved, definition, _count: { executions: 0 } }, ...items])
      setSelected(null); setName(''); setConditions([]); setWorkflowActions([newAction()]); setSchedule('NONE'); setScheduleTimezone('UTC'); setMessage(publish ? 'Workflow published.' : 'Workflow saved as draft.')
    } catch {
      setError('Unable to save this workflow. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  const toggle = async (workflow: Workflow) => {
    const result = await setWorkflowStatusAction({ id: workflow.id, active: workflow.status !== 'ACTIVE' })
    if ('error' in result) { setError(result.error); return }
    setWorkflows(items => items.map(item => item.id === workflow.id ? { ...item, status: workflow.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } : item))
  }
  const remove = async () => {
    if (!deleteTarget) return
    const result = await deleteWorkflowAction({ id: deleteTarget.id })
    if ('error' in result) { setError(result.error); return }
    setWorkflows(items => items.filter(item => item.id !== deleteTarget.id))
    setDeleteTarget(null)
  }
  const test = async (workflow: Workflow) => {
    try {
      const result = await testWorkflowAction({ workflowId: workflow.id })
      if ('error' in result) { setError(result.error); setTestResult(null) }
      else { setTestResult(result.data as WorkflowTestResult); setMessage('Test evaluated against organization data without running actions.') }
    } catch {
      setError('Unable to test this workflow. Please try again.')
      setTestResult(null)
    }
  }
  return <div className="flex flex-col gap-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-semibold tracking-tight">Automations</h2><p className="mt-1 text-sm text-muted-foreground">Build reliable workflows for repetitive work.</p></div><Button onClick={() => { setSelected(null); setName(''); setConditions([]); setWorkflowActions([newAction()]); setSchedule('NONE'); setMessage('') }}><Plus data-icon="inline-start" />New workflow</Button></div>
    {(error || message) && <div className={`rounded-md border px-3 py-2 text-sm ${error ? 'border-destructive/40 text-destructive' : 'border-emerald-500/40 text-emerald-600'}`}>{error || message}</div>}
    {deleteTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Delete workflow">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
        <h3 className="font-semibold">Delete {deleteTarget.name}?</h3>
        <p className="mt-2 text-sm text-muted-foreground">This permanently removes the workflow and its execution history.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => void remove()}>Delete workflow</Button>
        </div>
      </div>
    </div>}
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card><div className="flex items-center justify-between"><h3 className="font-semibold">Workflows</h3><button onClick={() => void refreshHistory()} className="text-xs text-primary"><History className="mr-1 inline size-3.5" />Execution history</button></div><div className="mt-4 flex flex-col gap-2">{workflows.map(workflow => <div key={workflow.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3"><WorkflowIcon className="size-4 text-primary" /><button className="min-w-0 flex-1 text-left" onClick={() => { setSelected(workflow); setName(workflow.name); setTrigger(workflow.definition.trigger === 'SCHEDULED' ? triggers[0] : workflow.definition.trigger); setConditions(workflow.definition.conditions ?? []); const savedActions = workflow.definition.actions ?? []; setWorkflowActions(savedActions.length ? savedActions.map(item => ({ ...item })) : [newAction()]); setSchedule(workflow.schedule); setScheduleTime(workflow.scheduleTime ?? '09:00'); setScheduleDay(String(workflow.scheduleDay ?? 1)); setScheduleTimezone(workflow.scheduleTimezone ?? 'UTC') }}><span className="block truncate text-sm font-medium">{workflow.name}</span><span className="text-xs text-muted-foreground">{workflow.definition.trigger} · {workflow._count.executions} executions</span></button><span className="text-[10px] uppercase text-muted-foreground">{workflow.status}</span><button onClick={() => void toggle(workflow)} className="text-xs text-primary">{workflow.status === 'ACTIVE' ? 'Pause' : 'Enable'}</button><button onClick={async () => { const result = await duplicateWorkflowAction({ id: workflow.id }); if ('ok' in result) setWorkflows(items => [{ ...(result.data as Workflow), _count: { executions: 0 } }, ...items]); else setError(result.error) }} aria-label="Duplicate"><Copy className="size-3.5" /></button><button onClick={() => setDeleteTarget(workflow)} aria-label="Delete"><Trash2 className="size-3.5 text-destructive" /></button><button onClick={() => void test(workflow)} aria-label="Test"><Play className="size-3.5 text-emerald-600" /></button></div>)}{!workflows.length && <p className="py-8 text-center text-sm text-muted-foreground">No workflows yet. Create your first automation.</p>}</div></Card>
      <Card>
        <h3 className="font-semibold">{selected ? 'Edit workflow' : 'Workflow builder'}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Trigger - conditions - actions</p>
        <div className="mt-4 flex flex-col gap-3">
          <label className="text-xs font-medium">Name<input value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="When a task is created" /></label>
          <label className="text-xs font-medium">Trigger<select value={trigger} onChange={event => setTrigger(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{triggers.filter(item => item !== 'SCHEDULED').map(item => <option key={item}>{item}</option>)}</select></label>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between"><h4 className="text-xs font-semibold">Conditions</h4><Button type="button" variant="outline" disabled={conditions.length >= 20} onClick={() => setConditions(items => [...items, { field: conditionFields[0], operator: 'equals', value: '' }])}>Add condition</Button></div>
            {conditions.map((condition, index) => <div key={index} className="rounded-md border border-border p-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs">Field<select value={condition.field} onChange={event => updateCondition(index, { field: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm">{conditionFields.map(item => <option key={item}>{item}</option>)}</select></label>
                <label className="text-xs">Operator<select value={condition.operator} onChange={event => updateCondition(index, { operator: event.target.value, value: ['is_set', 'is_not_set'].includes(event.target.value) ? undefined : condition.value ?? '' })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm">{conditionOperators.map(item => <option key={item}>{item}</option>)}</select></label>
              </div>
              {testResult && <Card>
                <h3 className="font-semibold">Workflow test · {testResult.trigger}</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <section><h4 className="text-xs font-semibold">Conditions</h4>{testResult.conditions.length ? <ul className="mt-2 space-y-1 text-xs">{testResult.conditions.map((condition, index) => <li key={`${condition.field}-${index}`} className={condition.passed ? 'text-emerald-600' : 'text-destructive'}>{condition.field} {condition.operator} {condition.value ?? ''} — {condition.passed ? 'passed' : 'not matched'}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No conditions configured.</p>}</section>
                  <section><h4 className="text-xs font-semibold">Actions</h4><ul className="mt-2 space-y-1 text-xs">{testResult.actions.map((action, index) => <li key={`${action.type}-${index}`} className={action.error ? 'text-destructive' : action.wouldRun ? 'text-emerald-600' : 'text-muted-foreground'}>{action.type} — {action.error ?? (action.wouldRun ? 'would run' : 'would be skipped')}</li>)}</ul></section>
                </div>
              </Card>}
              {!['is_set', 'is_not_set'].includes(condition.operator) && <label className="mt-2 block text-xs">Value<input value={condition.value ?? ''} onChange={event => updateCondition(index, { value: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>}
              <Button type="button" variant="ghost" className="mt-1" onClick={() => setConditions(items => items.filter((_, itemIndex) => itemIndex !== index))}>Remove condition</Button>
            </div>)}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between"><h4 className="text-xs font-semibold">Actions</h4><Button type="button" variant="outline" disabled={workflowActions.length >= 20} onClick={() => setWorkflowActions(items => [...items, newAction()])}>Add action</Button></div>
            {workflowActions.map((item, index) => <div key={index} className="flex flex-col gap-2 rounded-md border border-border p-2">
              <label className="text-xs">Action<select value={item.type} onChange={event => setWorkflowActions(items => items.map((current, itemIndex) => itemIndex === index ? newAction(event.target.value) : current))} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm">{actions.map(value => <option key={value}>{value}</option>)}</select></label>
              {item.type === 'CREATE_TASK' && <>
                <label className="text-xs">Project ID<input value={item.projectId ?? ''} onChange={event => updateActionAtIndex(index, { projectId: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Task title<input value={item.title ?? ''} onChange={event => updateActionAtIndex(index, { title: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Description<textarea value={item.description ?? ''} onChange={event => updateActionAtIndex(index, { description: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
              </>}
              {item.type === 'UPDATE_TASK' && <>
                <label className="text-xs">Task ID<input value={item.taskId ?? ''} onChange={event => updateActionAtIndex(index, { taskId: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Status<select value={item.status ?? ''} onChange={event => updateActionAtIndex(index, { status: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"><option value="">Leave unchanged</option>{['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].map(value => <option key={value}>{value}</option>)}</select></label>
                <label className="text-xs">Priority<select value={item.priority ?? ''} onChange={event => updateActionAtIndex(index, { priority: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"><option value="">Leave unchanged</option>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(value => <option key={value}>{value}</option>)}</select></label>
              </>}
              {item.type === 'ADD_COMMENT' && <>
                <label className="text-xs">Task ID<input value={item.taskId ?? ''} onChange={event => updateActionAtIndex(index, { taskId: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Comment<textarea value={item.body ?? ''} onChange={event => updateActionAtIndex(index, { body: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
              </>}
              {item.type === 'CREATE_NOTIFICATION' && <>
                <label className="text-xs">Title<input value={item.title ?? ''} onChange={event => updateActionAtIndex(index, { title: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Message<textarea value={item.body ?? ''} onChange={event => updateActionAtIndex(index, { body: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Recipient user ID (optional)<input value={item.userId ?? ''} onChange={event => updateActionAtIndex(index, { userId: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
              </>}
              {item.type === 'SEND_EMAIL' && <>
                <label className="text-xs">Recipient email<input type="email" value={item.to ?? ''} onChange={event => updateActionAtIndex(index, { to: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Subject<input value={item.subject ?? ''} onChange={event => updateActionAtIndex(index, { subject: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-xs">Message<textarea value={item.body ?? ''} onChange={event => updateActionAtIndex(index, { body: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
              </>}
              {workflowActions.length > 1 && <Button type="button" variant="ghost" onClick={() => setWorkflowActions(items => items.filter((_, itemIndex) => itemIndex !== index))}>Remove action</Button>}
            </div>)}
          </section>

          <label className="text-xs font-medium">Schedule<select value={schedule} onChange={event => setSchedule(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="NONE">Event driven</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option></select></label>
          {schedule !== 'NONE' && <><div className="flex gap-2"><input aria-label="Schedule time" type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />{schedule === 'WEEKLY' && <select aria-label="Schedule weekday" value={scheduleDay} onChange={event => setScheduleDay(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select>}</div><label className="text-xs font-medium">Time zone<input value={scheduleTimezone} onChange={event => setScheduleTimezone(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="UTC or America/New_York" /></label></>}
          <div className="flex gap-2"><Button disabled={loading || !workflowActions.length} onClick={() => void save(false)}>Save draft</Button><Button disabled={loading || !workflowActions.length} variant="outline" onClick={() => void save(true)}>Publish</Button></div>
        </div>
      </Card>
    </div>
    {Object.keys(summary).length > 0 && <Card><h3 className="font-semibold">Execution health</h3><div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><span>Completed: <b>{summary.COMPLETED ?? 0}</b></span><span>Queued: <b>{summary.QUEUED ?? 0}</b></span><span>Processing: <b>{summary.PROCESSING ?? 0}</b></span><span className="text-destructive">Failed: <b>{summary.FAILED ?? 0}</b></span></div></Card>}
    {executions.length > 0 && <Card><h3 className="font-semibold">Execution history</h3><div className="mt-3 divide-y divide-border">{executions.map(execution => <div key={execution.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="min-w-0">{execution.workflow.name} · {execution.trigger}{execution.retryCount > 0 && <span className="ml-2 text-muted-foreground">retry {execution.retryCount}</span>}{execution.error && <span className="ml-2 block truncate text-destructive">{execution.error}</span>}</span><span className="flex shrink-0 items-center gap-2"><span className={execution.status === 'FAILED' ? 'text-destructive' : execution.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}>{execution.status}</span>{execution.status === 'FAILED' && <button onClick={async () => { const result = await replayWorkflowExecutionAction({ id: execution.id }); if ('ok' in result) { setMessage('Execution queued for replay.'); await refreshHistory() } else setError(result.error) }} className="text-primary">Replay</button>}{(execution.status === 'QUEUED' || execution.status === 'PROCESSING') && <button onClick={async () => { const result = await cancelWorkflowExecutionAction({ id: execution.id }); if ('ok' in result) { setMessage('Execution cancelled.'); await refreshHistory() } else setError(result.error) }} className="text-muted-foreground">Cancel</button>}</span></div>)}</div></Card>}
  </div>
}

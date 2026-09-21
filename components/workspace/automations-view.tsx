'use client'

import { useState } from 'react'
import { Copy, History, Play, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/workspace/automation-primitives'
import { cancelWorkflowExecutionAction, createWorkflowAction, deleteWorkflowAction, duplicateWorkflowAction, listWorkflowExecutionsAction, replayWorkflowExecutionAction, setWorkflowStatusAction, testWorkflowAction, updateWorkflowAction, workflowExecutionSummaryAction } from '@/app/actions/workflows'

type Workflow = { id: string; name: string; description: string; status: string; schedule: string; scheduleTime?: string | null; scheduleDay?: number | null; definition: Definition; _count: { executions: number } }
type Definition = { trigger: string; conditions: { field: string; operator: string; value?: string }[]; actions: { type: string; title?: string; body?: string; projectId?: string; taskId?: string }[] }
type Execution = { id: string; trigger: string; status: string; retryCount: number; error: string | null; startedAt: string; workflow: { name: string } }
const triggers = ['TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_OVERDUE', 'PROJECT_CREATED', 'COMMENT_ADDED', 'SCHEDULED']
const actions = ['CREATE_NOTIFICATION', 'ADD_COMMENT', 'CREATE_TASK', 'UPDATE_TASK']
const conditionFields = ['priority', 'status', 'projectId', 'assigneeId', 'dueAt', 'title', 'description']

export default function AutomationsView({ initialWorkflows }: { initialWorkflows: Workflow[] }) {
  const [workflows, setWorkflows] = useState(initialWorkflows)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [selected, setSelected] = useState<Workflow | null>(null)
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState(triggers[0])
  const [action, setAction] = useState(actions[0])
  const [conditionField, setConditionField] = useState(conditionFields[0])
  const [conditionValue, setConditionValue] = useState('')
  const [schedule, setSchedule] = useState('NONE')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [scheduleDay, setScheduleDay] = useState('1')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Record<string, number>>({})

  const refreshHistory = async () => {
    const [result, totals] = await Promise.all([listWorkflowExecutionsAction(), workflowExecutionSummaryAction()])
    if ('ok' in result) setExecutions(result.data as Execution[])
    if ('ok' in totals) setSummary(totals.data as Record<string, number>)
  }
  const save = async (publish: boolean) => {
    setLoading(true); setError('')
    const effectiveTrigger = schedule !== 'NONE' ? 'SCHEDULED' : trigger
    const definition = { trigger: effectiveTrigger, conditions: conditionValue ? [{ field: conditionField, operator: 'equals', value: conditionValue }] : [], actions: [{ type: action, ...(action === 'CREATE_NOTIFICATION' ? { title: `${name || 'Workflow'} notification`, body: 'Workflow action completed.' } : {}), ...(action === 'ADD_COMMENT' ? { taskId: conditionValue || undefined, body: 'Workflow comment' } : {}), ...(action === 'CREATE_TASK' ? { projectId: conditionValue || undefined, title: `${name || 'Workflow'} task` } : {}), ...(action === 'UPDATE_TASK' ? { taskId: conditionValue || undefined, status: 'DONE' } : {}) }] }
    const scheduleInput = { frequency: schedule, time: scheduleTime, day: Number(scheduleDay) }
    const result = selected
      ? await updateWorkflowAction({ id: selected.id, name: name || selected.name, definition, publish, schedule: scheduleInput })
      : await createWorkflowAction({ name: name || 'Untitled workflow', definition, publish, schedule: scheduleInput })
    setLoading(false)
    if ('error' in result) { setError(result.error); return }
    const saved = result.data as Workflow
    setWorkflows(items => selected ? items.map(item => item.id === saved.id ? { ...item, ...saved, definition } : item) : [{ ...saved, definition, _count: { executions: 0 } }, ...items])
    setSelected(null); setName(''); setConditionValue(''); setSchedule('NONE'); setMessage(publish ? 'Workflow published.' : 'Workflow saved as draft.')
  }
  const toggle = async (workflow: Workflow) => {
    const result = await setWorkflowStatusAction({ id: workflow.id, active: workflow.status !== 'ACTIVE' })
    if ('error' in result) { setError(result.error); return }
    setWorkflows(items => items.map(item => item.id === workflow.id ? { ...item, status: workflow.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } : item))
  }
  const test = async (workflow: Workflow) => {
    const result = await testWorkflowAction({ workflowId: workflow.id, payload: {} })
    if ('error' in result) setError(result.error); else setMessage(`Test complete: ${(result.data as { actions: { wouldRun: boolean }[] }).actions.filter(item => item.wouldRun).length} action(s) would run.`)
  }
  return <div className="flex flex-col gap-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-semibold tracking-tight">Automations</h2><p className="mt-1 text-sm text-muted-foreground">Build reliable workflows for repetitive work.</p></div><Button onClick={() => { setSelected(null); setName(''); setMessage('') }}><Plus data-icon="inline-start" />New workflow</Button></div>
    {(error || message) && <div className={`rounded-md border px-3 py-2 text-sm ${error ? 'border-destructive/40 text-destructive' : 'border-emerald-500/40 text-emerald-600'}`}>{error || message}</div>}
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card><div className="flex items-center justify-between"><h3 className="font-semibold">Workflows</h3><button onClick={() => void refreshHistory()} className="text-xs text-primary"><History className="mr-1 inline size-3.5" />Execution history</button></div><div className="mt-4 flex flex-col gap-2">{workflows.map(workflow => <div key={workflow.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3"><WorkflowIcon className="size-4 text-primary" /><button className="min-w-0 flex-1 text-left" onClick={() => {             setSelected(workflow); setName(workflow.name); setTrigger(workflow.definition.trigger); setAction(workflow.definition.actions[0]?.type ?? actions[0]); setConditionField(workflow.definition.conditions[0]?.field ?? conditionFields[0]); setConditionValue(workflow.definition.conditions[0]?.value ?? workflow.definition.actions[0]?.projectId ?? workflow.definition.actions[0]?.taskId ?? ''); setSchedule(workflow.schedule); setScheduleTime(workflow.scheduleTime ?? '09:00'); setScheduleDay(String(workflow.scheduleDay ?? 1)) }}><span className="block truncate text-sm font-medium">{workflow.name}</span><span className="text-xs text-muted-foreground">{workflow.definition.trigger} · {workflow._count.executions} executions</span></button><span className="text-[10px] uppercase text-muted-foreground">{workflow.status}</span><button onClick={() => void toggle(workflow)} className="text-xs text-primary">{workflow.status === 'ACTIVE' ? 'Pause' : 'Enable'}</button><button onClick={async () => { const result = await duplicateWorkflowAction({ id: workflow.id }); if ('ok' in result) setWorkflows(items => [{ ...(result.data as Workflow), _count: { executions: 0 } }, ...items]); else setError(result.error) }} aria-label="Duplicate"><Copy className="size-3.5" /></button><button onClick={async () => { if (!confirm('Delete this workflow?')) return; const result = await deleteWorkflowAction({ id: workflow.id }); if ('ok' in result) setWorkflows(items => items.filter(item => item.id !== workflow.id)); else setError(result.error) }} aria-label="Delete"><Trash2 className="size-3.5 text-destructive" /></button><button onClick={() => void test(workflow)} aria-label="Test"><Play className="size-3.5 text-emerald-600" /></button></div>)}{!workflows.length && <p className="py-8 text-center text-sm text-muted-foreground">No workflows yet. Create your first automation.</p>}</div></Card>
      <Card><h3 className="font-semibold">{selected ? 'Edit workflow' : 'Workflow builder'}</h3><p className="mt-1 text-xs text-muted-foreground">Trigger - conditions - actions</p><div className="mt-4 flex flex-col gap-3"><label className="text-xs font-medium">Name<input value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="When a task is created" /></label><label className="text-xs font-medium">Trigger<select value={trigger} onChange={event => setTrigger(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{triggers.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium">Condition field<select value={conditionField} onChange={event => setConditionField(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="">No condition</option>{conditionFields.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium">Condition value<input value={conditionValue} onChange={event => setConditionValue(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Optional value or target ID" /></label><label className="text-xs font-medium">Action<select value={action} onChange={event => setAction(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{actions.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium">Schedule<select value={schedule} onChange={event => setSchedule(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="NONE">Event driven</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option></select></label>{schedule !== 'NONE' && <div className="flex gap-2"><input type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />{schedule === 'WEEKLY' && <select value={scheduleDay} onChange={event => setScheduleDay(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select>}</div>}<div className="flex gap-2"><Button disabled={loading} onClick={() => void save(false)}>Save draft</Button><Button disabled={loading} variant="outline" onClick={() => void save(true)}>Publish</Button></div></div></Card>
    </div>
    {Object.keys(summary).length > 0 && <Card><h3 className="font-semibold">Execution health</h3><div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><span>Completed: <b>{summary.COMPLETED ?? 0}</b></span><span>Queued: <b>{summary.QUEUED ?? 0}</b></span><span>Processing: <b>{summary.PROCESSING ?? 0}</b></span><span className="text-destructive">Failed: <b>{summary.FAILED ?? 0}</b></span></div></Card>}
    {executions.length > 0 && <Card><h3 className="font-semibold">Execution history</h3><div className="mt-3 divide-y divide-border">{executions.map(execution => <div key={execution.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="min-w-0">{execution.workflow.name} · {execution.trigger}{execution.retryCount > 0 && <span className="ml-2 text-muted-foreground">retry {execution.retryCount}</span>}{execution.error && <span className="ml-2 block truncate text-destructive">{execution.error}</span>}</span><span className="flex shrink-0 items-center gap-2"><span className={execution.status === 'FAILED' ? 'text-destructive' : execution.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}>{execution.status}</span>{execution.status === 'FAILED' && <button onClick={async () => { const result = await replayWorkflowExecutionAction({ id: execution.id }); if ('ok' in result) { setMessage('Execution queued for replay.'); await refreshHistory() } else setError(result.error) }} className="text-primary">Replay</button>}{(execution.status === 'QUEUED' || execution.status === 'PROCESSING') && <button onClick={async () => { const result = await cancelWorkflowExecutionAction({ id: execution.id }); if ('ok' in result) { setMessage('Execution cancelled.'); await refreshHistory() } else setError(result.error) }} className="text-muted-foreground">Cancel</button>}</span></div>)}</div></Card>}
  </div>
}

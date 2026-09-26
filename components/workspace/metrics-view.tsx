'use client'

import { useEffect, useState } from 'react'
import { getWorkspaceMetricsAction } from '@/app/actions/platform'

type Metrics = {
  projects: number
  activeProjects: number
  tasks: number
  completedTasks: number
  overdueTasks: number
  members: number
  documents: number
  readyDocuments: number
  failedDocuments: number
  workflowRuns: number
  failedWorkflowRuns: number
  aiRequests: number
  completionRate: number
  periodDays: number
}

export default function MetricsView({ view }: { view: 'Analytics' | 'Usage' }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void getWorkspaceMetricsAction().then(result => {
      if (!active) return
      if ('error' in result) setError(result.error)
      else setMetrics(result.data as Metrics)
    })
    return () => { active = false }
  }, [])

  if (error) return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{error}</div>
  if (!metrics) return <div aria-live="polite" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading organization metrics…</div>

  const items = [
    ['Projects', metrics.projects, `${metrics.activeProjects} active`],
    ['Tasks', metrics.tasks, `${metrics.completedTasks} completed`],
    ['Overdue tasks', metrics.overdueTasks, 'Currently overdue'],
    ['Team members', metrics.members, 'Organization members'],
    ['Documents', metrics.documents, `${metrics.readyDocuments} indexed, ${metrics.failedDocuments} failed`],
    ['Workflow runs', metrics.workflowRuns, `${metrics.failedWorkflowRuns} failed in 30 days`],
    ['AI requests', metrics.aiRequests, 'Last 30 days'],
    ['Completion rate', `${metrics.completionRate}%`, `${metrics.completedTasks} of ${metrics.tasks} tasks`],
  ] as const

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{view}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {view === 'Usage' ? 'Current organization counts and recent AI activity.' : `Live organization metrics; AI and workflow activity covers the last ${metrics.periodDays} days.`}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, value, detail]) => <article key={label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </article>)}
      </div>
    </div>
  )
}

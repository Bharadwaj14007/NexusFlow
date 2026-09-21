import { NextResponse } from 'next/server'
import { processOverdueTasks, processWorkflowJobs, scheduleDueWorkflows } from '@/lib/services/workflow-engine'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const configuredSecret = process.env.WORKFLOW_CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [scheduled, overdue, queued] = await Promise.all([
    scheduleDueWorkflows(),
    processOverdueTasks(),
    processWorkflowJobs(),
  ])
  return NextResponse.json({ ok: true, scheduled: scheduled.length, overdue: overdue.length, queued: queued.length })
}

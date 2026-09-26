import { NextResponse } from 'next/server'
import { processOverdueTasks, processWorkflowJobs, scheduleDueWorkflows } from '@/lib/services/workflow-engine'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const configuredSecret = process.env.WORKFLOW_CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [scheduled, overdue, queued, expiredRateLimitBuckets] = await Promise.all([
    scheduleDueWorkflows(),
    processOverdueTasks(),
    processWorkflowJobs(),
    prisma.apiRateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
  ])
  return NextResponse.json({ ok: true, scheduled: scheduled.length, overdue: overdue.length, queued: queued.length, expiredRateLimitBuckets: expiredRateLimitBuckets.count, processedAt: new Date().toISOString() })
}

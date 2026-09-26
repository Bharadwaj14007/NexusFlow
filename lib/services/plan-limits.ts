import { SubscriptionPlan } from '@prisma/client'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'

export const planLimits: Record<SubscriptionPlan, { aiRequests: number; seats: number; documents: number; projects: number; tasks: number; workflows: number; apiKeys: number }> = {
  FREE: { aiRequests: 100, seats: 5, documents: 25, projects: 3, tasks: 1_000, workflows: 3, apiKeys: 2 },
  PRO: { aiRequests: 10_000, seats: 50, documents: 2_000, projects: 100, tasks: 100_000, workflows: 100, apiKeys: 20 },
  ENTERPRISE: { aiRequests: 100_000, seats: 1_000, documents: 50_000, projects: 10_000, tasks: 1_000_000, workflows: 10_000, apiKeys: 1_000 },
}

export async function getEffectivePlan(organizationId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { plan: true, status: true },
  })
  if (!subscription || !['ACTIVE', 'TRIALING'].includes(subscription.status)) return SubscriptionPlan.FREE
  return subscription.plan
}

export async function assertPlanCapacity(organizationId: string, metric: 'seats' | 'documents' | 'projects' | 'tasks' | 'workflows' | 'apiKeys', additional = 1) {
  const [plan, current] = await Promise.all([
    getEffectivePlan(organizationId),
    metric === 'seats'
      ? prisma.membership.count({ where: { organizationId } }).then(async (count) => count + await prisma.organizationInvitation.count({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }))
      : metric === 'documents' ? prisma.document.count({ where: { organizationId } })
        : metric === 'projects' ? prisma.project.count({ where: { organizationId } })
          : metric === 'tasks' ? prisma.task.count({ where: { organizationId } })
            : metric === 'workflows' ? prisma.workflow.count({ where: { organizationId } })
              : prisma.apiKey.count({ where: { organizationId } }),
  ])
  if (current + additional > planLimits[plan][metric]) {
    throw new AppError('PLAN_LIMIT', `The ${plan} plan limit of ${planLimits[plan][metric]} ${metric} has been reached.`, 402)
  }
}

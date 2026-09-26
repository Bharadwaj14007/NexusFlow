import { AiRequestType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { getEffectivePlan, planLimits } from '@/lib/services/plan-limits'

function utcMonth(now = new Date()) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { periodStart, periodEnd }
}

export async function reserveAiRequest(organizationId: string) {
  const [{ periodStart, periodEnd }, plan] = [utcMonth(), await getEffectivePlan(organizationId)]
  const aiRequestLimit = planLimits[plan].aiRequests
  const usage = await prisma.usage.upsert({
    where: { organizationId_periodStart: { organizationId, periodStart } },
    create: { organizationId, periodStart, periodEnd, aiRequestLimit },
    update: { aiRequestLimit },
    select: { id: true },
  })
  const reserved = await prisma.usage.updateMany({
    where: { id: usage.id, aiRequests: { lt: aiRequestLimit } },
    data: { aiRequests: { increment: 1 } },
  })
  if (!reserved.count) throw new AppError('RATE_LIMITED', 'This organization has reached its monthly AI request limit.', 429)
  return usage.id
}

export async function releaseAiRequest(usageId: string) {
  await prisma.usage.updateMany({ where: { id: usageId, aiRequests: { gt: 0 } }, data: { aiRequests: { decrement: 1 } } })
}

export async function recordAiUsage(input: {
  organizationId: string
  userId: string
  model: string
  requestType: AiRequestType
  inputTokens?: number
  outputTokens?: number
}) {
  const inputTokens = Math.max(0, Math.trunc(input.inputTokens ?? 0))
  const outputTokens = Math.max(0, Math.trunc(input.outputTokens ?? 0))
  return prisma.aiUsage.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      model: input.model,
      requestType: input.requestType,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  })
}

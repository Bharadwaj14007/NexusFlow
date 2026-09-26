import { createHmac, timingSafeEqual } from 'node:crypto'
import { MembershipRole, SubscriptionPlan, SubscriptionStatus } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthContext } from '@/lib/auth/context'
import type { AuthContext } from '@/lib/auth/context'
import { AppError } from '@/lib/errors'
import { planLimits } from '@/lib/services/plan-limits'

const checkoutSchema = z.object({ plan: z.enum(['PRO', 'ENTERPRISE']) })
const verifySchema = z.object({
  razorpay_payment_id: z.string().min(1).max(200),
  razorpay_subscription_id: z.string().min(1).max(200),
  razorpay_signature: z.string().min(1).max(200),
})
type RazorpaySubscription = {
  id?: string
  status?: string
  customer_id?: string
  plan_id?: string
  current_start?: number
  current_end?: number
  notes?: { organizationId?: string; plan?: string }
}

const billingAdmins: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN]
type BillingContext = AuthContext & {
  organization: NonNullable<AuthContext['organization']>
  membership: NonNullable<AuthContext['membership']>
}

function assertBillingAdmin(): Promise<BillingContext> {
  return getAuthContext().then((context) => {
    if (!context) throw new AppError('UNAUTHORIZED', 'Sign in to manage billing.', 401)
    if (!context.organization || !context.membership) throw new AppError('FORBIDDEN', 'Select an organization to manage billing.', 403)
    if (!billingAdmins.includes(context.membership.role)) {
      throw new AppError('FORBIDDEN', 'Only organization owners and admins can manage billing.', 403)
    }
    return { ...context, organization: context.organization, membership: context.membership }
  })
}

function razorpayAuth() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) throw new AppError('CONFIGURATION', 'Razorpay billing credentials are required.', 503)
  return { keyId, keySecret, authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` }
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { authorization } = razorpayAuth()
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: authorization, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.ok) {
    console.error('Razorpay API request failed.', { path, status: response.status })
    throw new AppError('UPSTREAM', 'The payment provider could not complete the request.', 502)
  }
  return response.json() as Promise<T>
}

function periodDate(timestamp: number | undefined) {
  return typeof timestamp === 'number' ? new Date(timestamp * 1000) : null
}

export async function getBillingSummary() {
  const context = await getAuthContext()
  if (!context?.organization || !context.membership) throw new AppError('UNAUTHORIZED', 'Sign in to view billing.', 401)
  const now = new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [subscription, usage, seats, documents] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId: context.organization.id }, select: { plan: true, pendingPlan: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, providerSubscriptionId: true } }),
    prisma.usage.findUnique({ where: { organizationId_periodStart: { organizationId: context.organization.id, periodStart } }, select: { aiRequests: true } }),
    prisma.membership.count({ where: { organizationId: context.organization.id } }),
    prisma.document.count({ where: { organizationId: context.organization.id } }),
  ])
  const plan = subscription?.plan ?? SubscriptionPlan.FREE
  return {
    subscription: subscription ?? { plan, pendingPlan: null, status: SubscriptionStatus.ACTIVE, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, providerSubscriptionId: null },
    usage: { aiRequests: usage?.aiRequests ?? 0, aiRequestLimit: planLimits[plan].aiRequests, seats, seatLimit: planLimits[plan].seats, documents, documentLimit: planLimits[plan].documents, periodStart },
    canManage: billingAdmins.includes(context.membership.role),
  }
}

export async function createRazorpayCheckout(input: unknown) {
  const context = await assertBillingAdmin()
  const { plan } = checkoutSchema.parse(input)
  const selectedPlan = plan === 'PRO' ? process.env.RAZORPAY_PRO_PLAN_ID : process.env.RAZORPAY_ENTERPRISE_PLAN_ID
  if (!selectedPlan) throw new AppError('CONFIGURATION', `Set the Razorpay plan identifier for ${plan} before enabling checkout.`, 503)
  const previous = await prisma.subscription.findUnique({ where: { organizationId: context.organization.id } })
  if (previous?.providerSubscriptionId && (previous.status === 'ACTIVE' || previous.status === 'TRIALING')) {
    throw new AppError('CONFLICT', 'Cancel the active Razorpay subscription before starting a new plan checkout.', 409)
  }
  if (previous?.pendingPlan) throw new AppError('CONFLICT', 'A checkout for this organization is already in progress.', 409)
  await prisma.subscription.upsert({
    where: { organizationId: context.organization.id },
    create: { organizationId: context.organization.id, plan: 'FREE', status: 'ACTIVE' },
    update: {},
  })
  const reserved = await prisma.subscription.updateMany({
    where: { organizationId: context.organization.id, pendingPlan: null, OR: [{ providerSubscriptionId: null }, { status: 'CANCELED' }] },
    data: { pendingPlan: plan },
  })
  if (!reserved.count) throw new AppError('CONFLICT', 'A checkout or active subscription already exists.', 409)
  let result: RazorpaySubscription & { short_url?: string }
  try {
    result = await razorpayRequest<RazorpaySubscription & { short_url?: string }>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: selectedPlan,
        total_count: 120,
        quantity: 1,
        customer_notify: 1,
        notes: { organizationId: context.organization.id, plan },
      }),
    })
    if (!result.id) throw new AppError('UPSTREAM', 'The payment provider returned an invalid subscription.', 502)
  } catch (error) {
    await prisma.subscription.updateMany({ where: { organizationId: context.organization.id, pendingPlan: plan }, data: { pendingPlan: null } })
    throw error
  }
  await prisma.subscription.update({
    where: { organizationId: context.organization.id },
    data: { pendingPlan: plan, providerSubscriptionId: result.id, providerCustomerId: result.customer_id ?? null, providerPlanId: selectedPlan },
  })
  await prisma.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: 'billing.checkout_started', entityType: 'Subscription', metadata: { plan } } })
  return { keyId: razorpayAuth().keyId, subscriptionId: result.id, shortUrl: result.short_url ?? null, prefill: { email: context.user.email, name: context.user.name } }
}

export async function cancelRazorpaySubscription() {
  const context = await assertBillingAdmin()
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: context.organization.id } })
  if (subscription?.pendingPlan && subscription.providerSubscriptionId) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.providerSubscriptionId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    })
    await prisma.subscription.update({
      where: { organizationId: context.organization.id },
      data: { pendingPlan: null, providerSubscriptionId: null, providerCustomerId: null, providerPlanId: null, cancelAtPeriodEnd: false },
    })
    await prisma.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: 'billing.checkout_cancelled', entityType: 'Subscription' } })
    return { checkoutCancelled: true }
  }
  if (!subscription?.providerSubscriptionId || !['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(subscription.status)) {
    throw new AppError('CONFLICT', 'There is no active Razorpay subscription to cancel.', 409)
  }
  const immediate = subscription.status === 'PAST_DUE'
  await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.providerSubscriptionId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancel_at_cycle_end: immediate ? 0 : 1 }),
  })
  await prisma.subscription.update({ where: { organizationId: context.organization.id }, data: { cancelAtPeriodEnd: !immediate } })
  await prisma.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: immediate ? 'billing.cancellation_requested' : 'billing.cancellation_scheduled', entityType: 'Subscription' } })
  return { cancelAtPeriodEnd: !immediate }
}

export async function verifyRazorpayCheckout(input: unknown) {
  const context = await assertBillingAdmin()
  const data = verifySchema.parse(input)
  const { keySecret } = razorpayAuth()
  const expected = createHmac('sha256', keySecret).update(`${data.razorpay_payment_id}|${data.razorpay_subscription_id}`).digest()
  const received = Buffer.from(data.razorpay_signature, 'hex')
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new AppError('FORBIDDEN', 'Payment verification failed.', 401)
  }
  const providerSubscription = await razorpayRequest<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(data.razorpay_subscription_id)}`)
  if (providerSubscription.notes?.organizationId !== context.organization.id) {
    throw new AppError('FORBIDDEN', 'Subscription does not belong to this organization.', 403)
  }
  return syncRazorpaySubscription(providerSubscription)
}

export async function syncRazorpaySubscription(subscription: RazorpaySubscription, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (!subscription.id) return { ignored: true }
  const currentByProvider = await db.subscription.findUnique({
    where: { providerSubscriptionId: subscription.id },
    select: { organizationId: true, providerSubscriptionId: true, pendingPlan: true },
  })
  const organizationId = subscription.notes?.organizationId ?? currentByProvider?.organizationId
  const plan = subscription.notes?.plan
  if (!organizationId) return { ignored: true }
  const allowedPlan = plan === 'PRO' || plan === 'ENTERPRISE' ? plan : currentByProvider?.pendingPlan ?? null
  const status = subscription.status === 'active' ? 'ACTIVE'
    : subscription.status === 'halted' ? 'PAST_DUE'
      : subscription.status === 'cancelled' || subscription.status === 'completed' ? 'CANCELED'
        : subscription.status === 'created' || subscription.status === 'authenticated' ? 'TRIALING'
          : null
  if (!status) return { ignored: true }
  const current = await db.subscription.findUnique({ where: { organizationId }, select: { providerSubscriptionId: true, pendingPlan: true } })
  if (current?.providerSubscriptionId && current.providerSubscriptionId !== subscription.id) return { ignored: true }
  const activePlan = status === 'ACTIVE' ? allowedPlan ?? current?.pendingPlan : undefined
  return db.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      plan: status === 'ACTIVE' ? activePlan ?? SubscriptionPlan.FREE : SubscriptionPlan.FREE,
      status,
      pendingPlan: status === 'ACTIVE' ? null : allowedPlan,
      providerSubscriptionId: subscription.id,
      providerCustomerId: subscription.customer_id ?? null,
      providerPlanId: subscription.plan_id ?? null,
      currentPeriodStart: periodDate(subscription.current_start),
      currentPeriodEnd: periodDate(subscription.current_end),
      cancelAtPeriodEnd: false,
    },
    update: {
      ...(activePlan ? { plan: activePlan } : {}),
      status,
      ...(status === 'ACTIVE' ? { pendingPlan: null } : {}),
      providerCustomerId: subscription.customer_id ?? undefined,
      providerPlanId: subscription.plan_id ?? undefined,
      currentPeriodStart: periodDate(subscription.current_start),
      currentPeriodEnd: periodDate(subscription.current_end),
      ...(status === 'CANCELED' ? { pendingPlan: null, cancelAtPeriodEnd: false } : {}),
    },
  })
}

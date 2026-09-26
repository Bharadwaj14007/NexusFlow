import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncRazorpaySubscription } from '@/lib/services/billing.service'

type RazorpaySubscription = {
  id?: string
  status?: string
  customer_id?: string
  plan_id?: string
  current_start?: number
  current_end?: number
  notes?: { organizationId?: string; plan?: string }
}
type RazorpayEvent = {
  event?: string
  payload?: { subscription?: { entity?: RazorpaySubscription }; payment?: { entity?: { subscription_id?: string } } }
}

function validSignature(body: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(body).digest()
  const received = Buffer.from(signature, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function POST(request: Request) {
  const body = await request.text()
  if (body.length > 1_000_000) return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 })
  if (!validSignature(body, request.headers.get('x-razorpay-signature'))) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let event: RazorpayEvent
  try {
    event = JSON.parse(body) as RazorpayEvent
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }
  if (!event.event || event.event.length > 200) return NextResponse.json({ error: 'Invalid webhook event.' }, { status: 400 })

  const eventId = request.headers.get('x-razorpay-event-id')?.slice(0, 200) ?? createHash('sha256').update(body).digest('hex')
  try {
    await prisma.$transaction(async (tx) => {
      await tx.razorpayWebhookEvent.create({ data: { eventId, eventType: event.event! } })
      const entity = event.payload?.subscription?.entity
      if (entity) {
        await syncRazorpaySubscription(entity, tx)
      } else if (event.event === 'payment.failed') {
        const subscriptionId = event.payload?.payment?.entity?.subscription_id
        if (subscriptionId) {
          await tx.subscription.updateMany({
            where: { providerSubscriptionId: subscriptionId, status: { in: ['ACTIVE', 'TRIALING'] } },
            data: { status: 'PAST_DUE' },
          })
        }
      }
      await tx.razorpayWebhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } })
    })
    return NextResponse.json({ received: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error('Razorpay webhook processing failed.', { eventType: event.event, errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Webhook processing failed; provider may retry.' }, { status: 500 })
  }
}

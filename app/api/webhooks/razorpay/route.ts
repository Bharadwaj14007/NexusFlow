import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function validSignature(body: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(signature)
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
}

export async function POST(request: Request) {
  const body = await request.text()
  if (!validSignature(body, request.headers.get('x-razorpay-signature'))) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let event: { event?: string; payload?: Record<string, unknown> }
  try {
    event = JSON.parse(body) as typeof event
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  const eventId = request.headers.get('x-razorpay-event-id') ?? createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET ?? '').update(body).digest('hex')
  if (!event.event) return NextResponse.json({ received: true })
  const existing = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId }, select: { id: true } })
  if (existing) return NextResponse.json({ received: true, duplicate: true })
  await prisma.razorpayWebhookEvent.create({ data: { eventId, eventType: event.event } })
  return NextResponse.json({ received: true })
}

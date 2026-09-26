import { NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'
import { cancelRazorpaySubscription } from '@/lib/services/billing.service'

export async function POST() {
  try {
    return NextResponse.json(await cancelRazorpaySubscription(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Unable to cancel billing subscription.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to schedule subscription cancellation.' }, { status: 500 })
  }
}

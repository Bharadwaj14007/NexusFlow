import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AppError } from '@/lib/errors'
import { verifyRazorpayCheckout } from '@/lib/services/billing.service'

export async function POST(request: Request) {
  try {
    return NextResponse.json(await verifyRazorpayCheckout(await request.json()), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid payment verification.' }, { status: 400 })
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Unable to verify billing checkout.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to verify payment.' }, { status: 500 })
  }
}

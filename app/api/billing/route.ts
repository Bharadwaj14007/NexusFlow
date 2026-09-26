import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getBillingSummary, createRazorpayCheckout } from '@/lib/services/billing.service'
import { AppError } from '@/lib/errors'

export async function GET() {
  try {
    return NextResponse.json(await getBillingSummary(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Unable to load billing summary.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to load billing information.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await createRazorpayCheckout(await request.json()), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Unable to start billing checkout.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to start billing checkout.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { sendMessage } from '@/lib/services/ai.service'
import { isAppError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    return NextResponse.json(await sendMessage(await request.json()))
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 })
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Unable to process AI request.' }, { status: 500 })
  }
}

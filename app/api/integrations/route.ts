import { NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'
import { listIntegrations } from '@/lib/services/integration.service'

export async function GET() {
  try {
    return NextResponse.json(await listIntegrations(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Unable to list integrations.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to load integrations.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'
import { disconnectIntegration, testIntegration } from '@/lib/services/integration.service'

export async function POST(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    return NextResponse.json(await testIntegration((await params).provider.toUpperCase()), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Integration connection test failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Integration test failed.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    return NextResponse.json(await disconnectIntegration((await params).provider.toUpperCase()))
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Integration disconnect failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to disconnect integration.' }, { status: 500 })
  }
}

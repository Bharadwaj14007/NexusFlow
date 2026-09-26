import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/context'
import { isAppError } from '@/lib/errors'
import { uploadDocumentFile } from '@/lib/services/ai.service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const context = await getAuthContext()
  if (!context?.organization || !context.membership) return NextResponse.json({ error: 'Authentication and organization membership are required.' }, { status: 401 })
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 2_100_000) return NextResponse.json({ error: 'Document uploads are limited to 2 MB.' }, { status: 413 })
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a document file to upload.' }, { status: 400 })
    const result = await uploadDocumentFile(file)
    return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Document upload failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to upload and index this document.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    name: 'NexusFlow API',
    version: '1',
    documentation: '/api/docs',
    authentication: 'Bearer nxf_<secret> or x-api-key',
    rateLimit: '120 requests per API key per UTC minute',
    endpoints: ['/api/v1/projects', '/api/v1/tasks', '/api/v1/documents', '/api/v1/workflows'],
  })
}

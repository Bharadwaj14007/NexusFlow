import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    openapi: '3.1.0',
    info: { title: 'NexusFlow API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
    security: [{ ApiKeyBearer: [] }],
    paths: Object.fromEntries(['projects', 'tasks', 'documents', 'workflows'].map((resource) => [
      `/${resource}`,
      {
        get: {
          summary: `List organization ${resource}`,
          parameters: [
            { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
            { in: 'query', name: 'offset', schema: { type: 'integer', minimum: 0, default: 0 } },
          ],
          responses: { 200: { description: 'Paginated organization-scoped results' }, 401: { description: 'Missing or invalid API key' }, 429: { description: 'Rate limit exceeded' } },
        },
        ...(['projects', 'tasks'].includes(resource) ? {
          post: {
            summary: `Create an organization ${resource === 'projects' ? 'project' : 'task'}`,
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${resource === 'projects' ? 'ProjectCreate' : 'TaskCreate'}` } } },
            },
            responses: { 200: { description: 'Created resource' }, 400: { description: 'Invalid request' }, 401: { description: 'Missing or invalid API key' }, 429: { description: 'Rate limit exceeded' } },
          },
        } : {}),
      },
    ])),
    components: {
      securitySchemes: {
        ApiKeyBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'NexusFlow API key' },
      },
      schemas: {
        ProjectCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 3, maxLength: 120 },
            description: { type: 'string', maxLength: 2000 },
            status: { type: 'string', enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          },
        },
        TaskCreate: {
          type: 'object',
          required: ['projectId', 'title'],
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            title: { type: 'string', minLength: 2, maxLength: 200 },
            description: { type: 'string', maxLength: 5000 },
            status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          },
        },
      },
    },
  })
}

import { prisma } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { requireOrganization } from '@/lib/auth/guards'
import { conversationSchema, documentSchema, messageSchema } from '@/lib/validation/ai'

function apiKey() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new AppError('CONFIGURATION', 'OPENAI_API_KEY is not configured. Add it to the server environment to use AI.', 503)
  return key
}

type OpenAIResponse = { data?: { embedding?: number[] }[]; choices?: { message?: { content?: string } }[] }

async function openai(path: string, body: unknown): Promise<OpenAIResponse> {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new AppError('UPSTREAM', `OpenAI request failed (${response.status}). ${detail.slice(0, 240)}`, 502)
  }
  return response.json() as Promise<OpenAIResponse>
}

export async function listConversations() {
  const ctx = await requireOrganization()
  return prisma.aiConversation.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function listDocuments() {
  const ctx = await requireOrganization()
  return prisma.document.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, sizeBytes: true },
  })
}

export async function createConversation(input: unknown) {
  const ctx = await requireOrganization()
  const data = conversationSchema.parse(input)
  return prisma.aiConversation.create({ data: { ...data, organizationId: ctx.organization.id, createdById: ctx.user.id } })
}

export async function deleteConversation(input: unknown) {
  const ctx = await requireOrganization()
  const id = messageSchema.shape.conversationId.parse(typeof input === 'object' && input !== null ? (input as { conversationId?: unknown }).conversationId : undefined)
  if (!id) throw new AppError('VALIDATION', 'Conversation id is required.', 400)
  const conversation = await prisma.aiConversation.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true } })
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found.', 404)
  await prisma.aiConversation.delete({ where: { id: conversation.id } })
  return { id: conversation.id }
}

export async function indexDocument(input: unknown) {
  const ctx = await requireOrganization()
  const data = documentSchema.parse(input)
  const document = await prisma.document.create({
    data: { organizationId: ctx.organization.id, uploaderId: ctx.user.id, name: data.name, content: data.content, mimeType: data.mimeType, status: 'PROCESSING' },
  })
  try {
    const chunks = data.content.match(/[\s\S]{1,1800}(?:\s|$)/g) ?? [data.content]
    const embeddingResponse = await openai('embeddings', { model: 'text-embedding-3-small', input: chunks })
    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < chunks.length; index += 1) {
        const embedding = embeddingResponse.data?.[index]?.embedding
        await tx.documentChunk.create({ data: { documentId: document.id, organizationId: ctx.organization.id, chunkIndex: index, content: chunks[index], embeddingModel: embedding ? 'text-embedding-3-small' : null, dimensions: embedding?.length ?? null, metadata: { indexedAt: new Date().toISOString() } } })
        if (embedding) await tx.$executeRaw`UPDATE "DocumentChunk" SET "embedding" = ${`[${embedding.join(',')}]`}::vector WHERE "documentId" = ${document.id}::uuid AND "chunkIndex" = ${index}`
      }
      await tx.document.update({ where: { id: document.id }, data: { status: 'READY' } })
    })
  } catch (error) {
    await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } }).catch(() => undefined)
    throw error
  }
  return prisma.document.findUniqueOrThrow({ where: { id: document.id }, select: { id: true, name: true, status: true, createdAt: true } })
}

export async function sendMessage(input: unknown) {
  const ctx = await requireOrganization()
  const data = messageSchema.parse(input)
  const conversation = data.conversationId
    ? await prisma.aiConversation.findFirst({ where: { id: data.conversationId, organizationId: ctx.organization.id }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 30 } } })
    : await createConversation({ title: data.content.slice(0, 60) })
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found.', 404)
  const queryEmbedding = await openai('embeddings', { model: 'text-embedding-3-small', input: data.content })
  const vector = queryEmbedding.data?.[0]?.embedding
  const matches = vector
    ? await prisma.$queryRaw<{ id: string; documentId: string; content: string; name: string }[]>`SELECT c."id", c."documentId", c."content", d."name" FROM "DocumentChunk" c JOIN "Document" d ON d."id" = c."documentId" WHERE c."organizationId" = ${ctx.organization.id}::uuid AND d."status" = 'READY' AND c."embedding" IS NOT NULL ORDER BY c."embedding" <=> ${`[${vector.join(',')}]`}::vector LIMIT 8`
    : []
  const context = matches.map((m) => `[${m.name}] ${m.content}`).join('\n\n')
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: ctx.organization.id, archivedAt: null },
      select: { name: true, description: true, status: true, priority: true },
      take: 100,
    }),
    prisma.task.findMany({
      where: { organizationId: ctx.organization.id, archivedAt: null },
      select: { title: true, description: true, status: true, priority: true, project: { select: { name: true } } },
      take: 200,
    }),
  ])
  const workspaceContext = [
    'Projects:',
    ...projects.map((project) => `- ${project.name} (${project.status}, ${project.priority}): ${project.description}`),
    'Tasks:',
    ...tasks.map((task) => `- ${task.title} in ${task.project.name} (${task.status}, ${task.priority}): ${task.description}`),
  ].join('\n')
  const history = ('messages' in conversation ? conversation.messages : []) as { role: string; content: string }[]
  const userMessage = await prisma.aiMessage.create({ data: { conversationId: conversation.id, organizationId: ctx.organization.id, role: 'user', content: data.content } })
  const completion = await openai('chat/completions', { model: 'gpt-4o-mini', messages: [{ role: 'system', content: `Answer using the organization's projects, tasks, and permitted documents when relevant. If context is insufficient, say so. Workspace context:\n${workspaceContext}\nDocuments:\n${context}` }, ...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: data.content }] })
  const answer = completion.choices?.[0]?.message?.content ?? 'I could not generate a response.'
  const assistant = await prisma.aiMessage.create({ data: { conversationId: conversation.id, organizationId: ctx.organization.id, role: 'assistant', content: answer, citations: matches.map((m) => ({ documentId: m.documentId, name: m.name })) } })
  return { conversationId: conversation.id, userMessage, assistant }
}

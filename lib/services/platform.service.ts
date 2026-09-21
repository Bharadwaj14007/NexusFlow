import { createHash, randomBytes } from 'node:crypto'
import { MembershipRole, NotificationType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth, requireOrganization, requireRole } from '@/lib/auth/guards'
import { AppError } from '@/lib/errors'
import { apiKeyCreateSchema, apiKeyIdSchema, documentIdSchema, inviteSchema, invitationTokenSchema, memberIdSchema, notificationIdSchema, searchSchema } from '@/lib/validation/platform'
import { indexDocument } from '@/lib/services/ai.service'

const admins = [MembershipRole.OWNER, MembershipRole.ADMIN]
const managers = [...admins, MembershipRole.MANAGER]
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

async function audit(organizationId: string, actorId: string, action: string, entityType: string, entityId?: string, metadata?: object) {
  await prisma.auditLog.create({ data: { organizationId, actorId, action, entityType, entityId, metadata } })
}

export async function listMembers() {
  const ctx = await requireOrganization()
  return prisma.membership.findMany({ where: { organizationId: ctx.organization.id }, include: { user: { select: { id: true, name: true, email: true, avatarInitials: true } } }, orderBy: { createdAt: 'asc' } })
}

export async function inviteMember(input: unknown) {
  const ctx = await requireRole(...managers)
  const data = inviteSchema.parse(input)
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })
  if (user && await prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: ctx.organization.id } } })) throw new AppError('VALIDATION', 'That user is already a member.', 400)
  const token = randomBytes(32).toString('hex')
  const invitation = await prisma.organizationInvitation.create({ data: { organizationId: ctx.organization.id, email: data.email.toLowerCase(), role: data.role, tokenHash: hash(token), invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86400000) } })
  if (user) await prisma.notification.create({ data: { organizationId: ctx.organization.id, userId: user.id, type: NotificationType.SYSTEM, title: 'Organization invitation', body: `You were invited to join ${ctx.organization.name}.` } })
  await audit(ctx.organization.id, ctx.user.id, 'invitation.created', 'OrganizationInvitation', invitation.id, { email: data.email, role: data.role })
  return { id: invitation.id, token }
}

export async function revokeInvitation(input: unknown) {
  const ctx = await requireRole(...managers)
  const { id } = documentIdSchema.parse(input)
  const result = await prisma.organizationInvitation.updateMany({ where: { id, organizationId: ctx.organization.id, revokedAt: null }, data: { revokedAt: new Date() } })
  if (!result.count) throw new AppError('NOT_FOUND', 'Invitation not found.', 404)
  await audit(ctx.organization.id, ctx.user.id, 'invitation.revoked', 'OrganizationInvitation', id)
  return { ok: true }
}

export async function acceptInvitation(input: unknown) {
  const ctx = await requireAuth()
  const { token } = invitationTokenSchema.parse(input)
  const invitation = await prisma.organizationInvitation.findFirst({ where: { tokenHash: hash(token), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })
  if (!invitation || invitation.email !== ctx.user.email.toLowerCase()) throw new AppError('FORBIDDEN', 'This invitation is invalid or does not belong to your account.', 403)
  await prisma.$transaction(async tx => {
    await tx.membership.upsert({ where: { userId_organizationId: { userId: ctx.user.id, organizationId: invitation.organizationId } }, create: { userId: ctx.user.id, organizationId: invitation.organizationId, role: invitation.role }, update: { role: invitation.role } })
    await tx.organizationInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })
  })
  await audit(invitation.organizationId, ctx.user.id, 'invitation.accepted', 'OrganizationInvitation', invitation.id)
  return { ok: true }
}

export async function removeMember(input: unknown) {
  const ctx = await requireRole(...admins)
  const { userId } = memberIdSchema.parse(input)
  if (userId === ctx.user.id) throw new AppError('VALIDATION', 'You cannot remove yourself.', 400)
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: ctx.organization.id } } })
  if (!membership) throw new AppError('NOT_FOUND', 'Member not found.', 404)
  if (membership.role === MembershipRole.OWNER) throw new AppError('FORBIDDEN', 'The organization owner cannot be removed.', 403)
  await prisma.membership.delete({ where: { id: membership.id } })
  await audit(ctx.organization.id, ctx.user.id, 'membership.removed', 'Membership', membership.id, { userId })
  return { ok: true }
}

export async function updateMemberRole(input: unknown) {
  const ctx = await requireRole(...admins)
  const data = memberIdSchema.extend({ role: inviteSchema.shape.role }).parse(input)
  if (data.userId === ctx.user.id || data.role === MembershipRole.OWNER) throw new AppError('FORBIDDEN', 'Owner role changes are not permitted here.', 403)
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: data.userId, organizationId: ctx.organization.id } } })
  if (!membership) throw new AppError('NOT_FOUND', 'Member not found.', 404)
  const updated = await prisma.membership.update({ where: { id: membership.id }, data: { role: data.role } })
  await audit(ctx.organization.id, ctx.user.id, 'membership.role_updated', 'Membership', membership.id, { userId: data.userId, role: data.role })
  return updated
}

export async function listNotifications() {
  const ctx = await requireOrganization()
  return prisma.notification.findMany({ where: { organizationId: ctx.organization.id, userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: 100 })
}
export async function markNotificationRead(input: unknown) {
  const ctx = await requireOrganization()
  const { id } = notificationIdSchema.parse(input)
  const result = await prisma.notification.updateMany({ where: { id, organizationId: ctx.organization.id, userId: ctx.user.id }, data: { readAt: new Date() } })
  if (!result.count) throw new AppError('NOT_FOUND', 'Notification not found.', 404)
  return { ok: true }
}
export async function markAllNotificationsRead() {
  const ctx = await requireOrganization()
  await prisma.notification.updateMany({ where: { organizationId: ctx.organization.id, userId: ctx.user.id, readAt: null }, data: { readAt: new Date() } })
  return { ok: true }
}

export async function deleteDocument(input: unknown) {
  const ctx = await requireRole(...managers)
  const { id } = documentIdSchema.parse(input)
  const result = await prisma.document.deleteMany({ where: { id, organizationId: ctx.organization.id } })
  if (!result.count) throw new AppError('NOT_FOUND', 'Document not found.', 404)
  await audit(ctx.organization.id, ctx.user.id, 'document.deleted', 'Document', id)
  return { ok: true }
}
export async function reindexDocument(input: unknown) {
  const ctx = await requireRole(...managers)
  const { id } = documentIdSchema.parse(input)
  const document = await prisma.document.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!document?.content) throw new AppError('NOT_FOUND', 'Document content not found.', 404)
  return indexDocument({ name: document.name, content: document.content })
}

export async function listApiKeys() {
  const ctx = await requireRole(...managers)
  return prisma.apiKey.findMany({ where: { organizationId: ctx.organization.id }, select: { id: true, name: true, keyPrefix: true, expiresAt: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
}
export async function createApiKey(input: unknown) {
  const ctx = await requireRole(...admins)
  const data = apiKeyCreateSchema.parse(input)
  const secret = `nxf_${randomBytes(24).toString('hex')}`
  const key = await prisma.apiKey.create({ data: { organizationId: ctx.organization.id, name: data.name, keyPrefix: secret.slice(0, 12), keyHash: hash(secret), expiresAt: data.expiresAt } })
  await audit(ctx.organization.id, ctx.user.id, 'api_key.created', 'ApiKey', key.id, { name: data.name })
  return { id: key.id, name: key.name, secret }
}
export async function revokeApiKey(input: unknown) {
  const ctx = await requireRole(...admins)
  const { id } = apiKeyIdSchema.parse(input)
  const result = await prisma.apiKey.deleteMany({ where: { id, organizationId: ctx.organization.id } })
  if (!result.count) throw new AppError('NOT_FOUND', 'API key not found.', 404)
  await audit(ctx.organization.id, ctx.user.id, 'api_key.revoked', 'ApiKey', id)
  return { ok: true }
}

export async function searchOrganization(input: unknown) {
  const ctx = await requireOrganization()
  const { query } = searchSchema.parse(input)
  const term = { contains: query, mode: 'insensitive' as const }
  const [projects, tasks, documents, members, workflows, conversations] = await Promise.all([
    prisma.project.findMany({ where: { organizationId: ctx.organization.id, OR: [{ name: term }, { description: term }] }, take: 10, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { organizationId: ctx.organization.id, OR: [{ title: term }, { description: term }] }, take: 10, select: { id: true, title: true } }),
    prisma.document.findMany({ where: { organizationId: ctx.organization.id, name: term }, take: 10, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { memberships: { some: { organizationId: ctx.organization.id } }, OR: [{ name: term }, { email: term }] }, take: 10, select: { id: true, name: true, email: true } }),
    prisma.workflow.findMany({ where: { organizationId: ctx.organization.id, name: term }, take: 10, select: { id: true, name: true } }),
    prisma.aiConversation.findMany({ where: { organizationId: ctx.organization.id, title: term }, take: 10, select: { id: true, title: true } }),
  ])
  return { projects, tasks, documents, members, workflows, conversations }
}

export async function listAuditLogs() {
  const ctx = await requireRole(...managers)
  return prisma.auditLog.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { name: true, email: true } } } })
}

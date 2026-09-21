import { z } from 'zod'

export const memberRoleSchema = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
export const inviteSchema = z.object({ email: z.string().email(), role: memberRoleSchema.default('MEMBER') })
export const invitationTokenSchema = z.object({ token: z.string().min(20).max(200) })
export const memberIdSchema = z.object({ userId: z.string().uuid() })
export const notificationIdSchema = z.object({ id: z.string().uuid() })
export const documentIdSchema = z.object({ id: z.string().uuid() })
export const apiKeyIdSchema = z.object({ id: z.string().uuid() })
export const apiKeyCreateSchema = z.object({ name: z.string().trim().min(2).max(100), expiresAt: z.coerce.date().nullable().optional() })
export const searchSchema = z.object({ query: z.string().trim().min(1).max(100) })

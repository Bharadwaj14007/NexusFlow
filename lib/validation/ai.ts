import { z } from 'zod'

export const conversationSchema = z.object({ title: z.string().trim().min(1).max(120).default('New conversation') })
export const messageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().trim().min(1).max(12000),
})
export const documentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(2_000_000),
  mimeType: z.string().max(120).optional(),
})

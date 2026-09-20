'use server'

import { ZodError } from 'zod'
import { isAppError } from '@/lib/errors'
import * as service from '@/lib/services/ai.service'

function result(error: unknown) {
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? 'Invalid input.' }
  if (isAppError(error)) return { error: error.message }
  throw error
}
function action(fn: (input: unknown) => Promise<unknown>) {
  return async (input: unknown) => { try { return { ok: true as const, data: await fn(input) } } catch (error) { return result(error) } }
}
export const listConversationsAction = async () => { try { return { ok: true as const, data: await service.listConversations() } } catch (error) { return result(error) } }
export const listDocumentsAction = async () => { try { return { ok: true as const, data: await service.listDocuments() } } catch (error) { return result(error) } }
export const createConversationAction = action(service.createConversation)
export const deleteConversationAction = action(service.deleteConversation)
export const sendMessageAction = action(service.sendMessage)
export const indexDocumentAction = action(service.indexDocument)

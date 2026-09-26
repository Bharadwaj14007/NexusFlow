'use server'

import { ZodError } from 'zod'
import { isAppError } from '@/lib/errors'
import * as service from '@/lib/services/platform.service'

function result(error: unknown) {
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? 'Invalid input.' }
  if (isAppError(error)) return { error: error.message }
  throw error
}
function action(fn: (input?: unknown) => Promise<unknown>) {
  return async (input: unknown = {}) => {
    try { return { ok: true as const, data: await fn(input) } } catch (error) { return result(error) }
  }
}
export const listMembersAction = action(service.listMembers)
export const listPendingInvitationsAction = action(service.listPendingInvitations)
export const inviteMemberAction = action(service.inviteMember)
export const revokeInvitationAction = action(service.revokeInvitation)
export const acceptInvitationAction = action(service.acceptInvitation)
export const removeMemberAction = action(service.removeMember)
export const updateMemberRoleAction = action(service.updateMemberRole)
export const listNotificationsAction = action(service.listNotifications)
export const markNotificationReadAction = action(service.markNotificationRead)
export const markAllNotificationsReadAction = action(service.markAllNotificationsRead)
export const deleteDocumentAction = action(service.deleteDocument)
export const reindexDocumentAction = action(service.reindexDocument)
export const listApiKeysAction = action(service.listApiKeys)
export const createApiKeyAction = action(service.createApiKey)
export const revokeApiKeyAction = action(service.revokeApiKey)
export const searchOrganizationAction = action(service.searchOrganization)
export const listAuditLogsAction = action(service.listAuditLogs)
export const getWorkspaceMetricsAction = action(service.getWorkspaceMetrics)

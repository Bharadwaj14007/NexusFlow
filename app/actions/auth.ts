'use server'

import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { MembershipRole } from '@prisma/client'
import { ZodError } from 'zod'
import { requireRole } from '@/lib/auth/guards'
import { isAppError } from '@/lib/errors'
import { changePassword, completeOnboarding, listCurrentUserSessions, requestPasswordReset, resetPassword, revokeOtherUserSessions, revokeUserSession, signIn, signOut, signUp } from '@/lib/services/auth.service'
import { createOrganization, switchOrganization, updateCurrentOrganization } from '@/lib/services/organization.service'
import { onboardingSchema } from '@/lib/validation/auth'

function actionError(error: unknown): { error: string } {
  if (isRedirectError(error)) throw error
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? 'Invalid input.' }
  }
  if (isAppError(error)) return { error: error.message }
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined
  console.error('Authentication action failed.', { name: error instanceof Error ? error.name : 'UnknownError', code })
  return { error: 'Unable to complete that request. Please try again.' }
}

function invitationReturnTo(value?: string) {
  return value && /^\/invitations\/[a-f0-9]{64}$/i.test(value) ? value : null
}

export async function signInAction(input: { email: string; password: string; returnTo?: string }) {
  try {
    const result = await signIn(input)
    const returnTo = invitationReturnTo(input.returnTo)
    if (returnTo) redirect(returnTo)
    if (result.needsOrganization) redirect('/auth?setup=1')
    redirect('/workspace')
  } catch (error) {
    return actionError(error)
  }
}

export async function signUpAction(input: { name: string; email: string; password: string; returnTo?: string }) {
  try {
    await signUp(input)
    const returnTo = invitationReturnTo(input.returnTo)
    if (returnTo) redirect(returnTo)
    redirect('/auth?setup=1')
  } catch (error) {
    return actionError(error)
  }
}

export async function requestPasswordResetAction(input: { email: string }) {
  try {
    await requestPasswordReset(input)
    return { ok: true as const }
  } catch (error) {
    return actionError(error)
  }
}

export async function resetPasswordAction(input: { token: string; password: string }) {
  try {
    await resetPassword(input)
    return { ok: true as const }
  } catch (error) {
    return actionError(error)
  }
}

export async function changePasswordAction(input: { currentPassword: string; password: string }) {
  try {
    await changePassword(input)
    return { ok: true as const }
  } catch (error) {
    return actionError(error)
  }
}

export async function listSessionsAction() {
  try {
    return { ok: true as const, data: await listCurrentUserSessions() }
  } catch (error) {
    return actionError(error)
  }
}

export async function revokeSessionAction(input: { id: string }) {
  try {
    return { ok: true as const, data: await revokeUserSession(input) }
  } catch (error) {
    return actionError(error)
  }
}

export async function revokeOtherSessionsAction() {
  try {
    return { ok: true as const, data: await revokeOtherUserSessions() }
  } catch (error) {
    return actionError(error)
  }
}

export async function completeOnboardingAction(input: {
  name: string
  organizationName: string
  organizationType?: string
}) {
  try {
    const data = onboardingSchema.parse(input)
    await completeOnboarding(data)
    redirect('/workspace')
  } catch (error) {
    return actionError(error)
  }
}

export async function signOutAction() {
  await signOut()
  redirect('/auth')
}

export async function createOrganizationAction(input: { name: string; type?: string }) {
  try {
    await createOrganization(input)
    redirect('/workspace')
  } catch (error) {
    return actionError(error)
  }
}

export async function switchOrganizationAction(organizationId: string) {
  try {
    await switchOrganization({ organizationId })
    redirect('/workspace')
  } catch (error) {
    return actionError(error)
  }
}

export async function updateOrganizationAction(input: { name: string; type?: string }) {
  try {
    await requireRole(MembershipRole.OWNER, MembershipRole.ADMIN)
    await updateCurrentOrganization(input)
    return { ok: true as const }
  } catch (error) {
    return actionError(error)
  }
}

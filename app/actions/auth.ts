'use server'

import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { MembershipRole } from '@prisma/client'
import { ZodError } from 'zod'
import { requireRole } from '@/lib/auth/guards'
import { isAppError } from '@/lib/errors'
import { completeOnboarding, signIn, signOut, signUp } from '@/lib/services/auth.service'
import { createOrganization, switchOrganization, updateCurrentOrganization } from '@/lib/services/organization.service'
import { onboardingSchema } from '@/lib/validation/auth'

function actionError(error: unknown): { error: string } {
  if (isRedirectError(error)) throw error
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? 'Invalid input.' }
  }
  if (isAppError(error)) return { error: error.message }
  console.error('Authentication action failed.', error instanceof Error ? error.message : 'Unknown error')
  return { error: 'Unable to complete that request. Please try again.' }
}

export async function signInAction(input: { email: string; password: string }) {
  try {
    const result = await signIn(input)
    if (result.needsOrganization) redirect('/auth?setup=1')
    redirect('/workspace')
  } catch (error) {
    return actionError(error)
  }
}

export async function signUpAction(input: { name: string; email: string; password: string }) {
  try {
    await signUp(input)
    redirect('/auth?setup=1')
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

import { MembershipRole } from '@prisma/client'
import { redirect } from 'next/navigation'
import { AppError } from '@/lib/errors'
import { getAuthContext, type AuthContext } from '@/lib/auth/context'

export type OrganizationContext = AuthContext & {
  organization: NonNullable<AuthContext['organization']>
  membership: NonNullable<AuthContext['membership']>
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth')
  return ctx
}

export async function requireOrganization(): Promise<OrganizationContext> {
  const ctx = await requireAuth()
  if (!ctx.organization || !ctx.membership) redirect('/auth?setup=1')
  return ctx as OrganizationContext
}

export async function requireRole(...roles: MembershipRole[]): Promise<OrganizationContext> {
  const ctx = await requireOrganization()
  if (!roles.includes(ctx.membership.role)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to do that.', 403)
  }
  return ctx
}

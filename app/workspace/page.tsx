import WorkspaceApp from '@/components/workspace/workspace-app'
import { requireOrganization } from '@/lib/auth/guards'
import { initialsFromName, roleLabel } from '@/lib/utils/identity'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const ctx = await requireOrganization()

  return (
    <WorkspaceApp
      user={{
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        avatarInitials: ctx.user.avatarInitials ?? initialsFromName(ctx.user.name),
        role: roleLabel(ctx.membership.role),
      }}
      organization={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        type: ctx.organization.type,
      }}
      organizations={ctx.organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        type: organization.type,
        role: roleLabel(organization.role),
      }))}
    />
  )
}

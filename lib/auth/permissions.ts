import { MembershipRole } from '@prisma/client'

export type Permission =
  | 'projects:read' | 'projects:create' | 'projects:update' | 'projects:delete'
  | 'tasks:read' | 'tasks:create' | 'tasks:update' | 'tasks:delete'
  | 'documents:read' | 'documents:create' | 'documents:delete'
  | 'workflows:read' | 'workflows:create' | 'workflows:update' | 'workflows:delete' | 'workflows:execute'
  | 'members:read' | 'members:invite' | 'members:update' | 'members:remove'
  | 'billing:read' | 'billing:manage' | 'integrations:manage'
  | 'api_keys:create' | 'api_keys:revoke' | 'audit_logs:read'

const readPermissions: Permission[] = [
  'projects:read', 'tasks:read', 'documents:read', 'workflows:read', 'members:read', 'billing:read',
]
const grant = (...permissions: Permission[]) => new Set<Permission>(permissions)
const allPermissions = new Set<Permission>([
  ...readPermissions,
  'projects:create', 'projects:update', 'projects:delete',
  'tasks:create', 'tasks:update', 'tasks:delete',
  'documents:create', 'documents:delete',
  'workflows:create', 'workflows:update', 'workflows:delete', 'workflows:execute',
  'members:invite', 'members:update', 'members:remove',
  'billing:manage', 'integrations:manage', 'api_keys:create', 'api_keys:revoke', 'audit_logs:read',
])

const rolePermissions: Record<MembershipRole, ReadonlySet<Permission>> = {
  OWNER: allPermissions,
  ADMIN: grant(...allPermissions),
  MANAGER: grant(
    ...readPermissions,
    'projects:create', 'projects:update', 'tasks:create', 'tasks:update',
    'documents:create', 'workflows:create', 'workflows:update', 'workflows:execute',
    'members:invite',
  ),
  MEMBER: grant('projects:read', 'tasks:read', 'tasks:create', 'tasks:update', 'documents:read', 'workflows:read', 'workflows:execute'),
  VIEWER: grant(...readPermissions),
}

export function hasPermission(role: MembershipRole, permission: Permission) {
  return rolePermissions[role].has(permission)
}

export function canInviteRole(actor: MembershipRole, invited: MembershipRole) {
  if (invited === MembershipRole.OWNER) return false
  if (actor === MembershipRole.OWNER) return true
  if (actor === MembershipRole.ADMIN) return invited !== MembershipRole.ADMIN
  return actor === MembershipRole.MANAGER && (invited === MembershipRole.MEMBER || invited === MembershipRole.VIEWER)
}

export function canManageMemberRole(actor: MembershipRole, target: MembershipRole, next?: MembershipRole) {
  if (target === MembershipRole.OWNER || next === MembershipRole.OWNER) return false
  if (actor === MembershipRole.OWNER) return true
  if (actor !== MembershipRole.ADMIN) return false
  return target !== MembershipRole.ADMIN && next !== MembershipRole.ADMIN
}

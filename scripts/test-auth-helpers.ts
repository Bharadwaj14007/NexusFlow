import { hashPassword, verifyPassword } from '../lib/auth/password'
import { initialsFromName, slugify } from '../lib/utils/identity'
import { canInviteRole, canManageMemberRole, hasPermission } from '../lib/auth/permissions'
import { MembershipRole } from '@prisma/client'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const hash = hashPassword('password123')
assert(hash.startsWith('pbkdf2$sha512$120000$'), 'hash format')
assert(verifyPassword('password123', hash), 'verify matching password')
assert(!verifyPassword('wrong-password', hash), 'reject wrong password')
assert(initialsFromName('Alex Morgan') === 'AM', 'initials')
assert(slugify('Nexus Labs') === 'nexus-labs', 'slug')
assert(!canInviteRole(MembershipRole.MANAGER, MembershipRole.OWNER), 'manager cannot invite owner')
assert(!canInviteRole(MembershipRole.ADMIN, MembershipRole.ADMIN), 'admin cannot invite another admin')
assert(canInviteRole(MembershipRole.OWNER, MembershipRole.ADMIN), 'owner can invite admin')
assert(!canManageMemberRole(MembershipRole.ADMIN, MembershipRole.ADMIN, MembershipRole.MEMBER), 'admin cannot alter admin role')
assert(!hasPermission(MembershipRole.VIEWER, 'tasks:update'), 'viewer cannot update tasks')
assert(hasPermission(MembershipRole.MEMBER, 'tasks:create'), 'member can create tasks')
console.log('Auth helpers passed.')

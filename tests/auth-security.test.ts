import assert from 'node:assert/strict'
import test from 'node:test'
import { MembershipRole } from '@prisma/client'
import { canInviteRole, canManageMemberRole, hasPermission } from '../lib/auth/permissions'
import { hashPassword, verifyPassword } from '../lib/auth/password'
import { inviteSchema } from '../lib/validation/platform'
import { signInSchema, signUpSchema } from '../lib/validation/auth'

test('password hash verifies the original password and rejects a different one', () => {
  const hash = hashPassword('correct horse battery staple')
  assert.notEqual(hash, 'correct horse battery staple')
  assert.equal(verifyPassword('correct horse battery staple', hash), true)
  assert.equal(verifyPassword('wrong password', hash), false)
})

test('sign-up requires a valid email, password, and display name', () => {
  assert.equal(signUpSchema.safeParse({ name: 'A User', email: 'a@example.test', password: 'password123' }).success, true)
  assert.equal(signUpSchema.safeParse({ email: 'a@example.test', password: 'password123' }).success, false)
  assert.equal(signInSchema.safeParse({ email: 'invalid', password: 'password123' }).success, false)
})

test('invitation validation cannot grant organization ownership', () => {
  assert.equal(inviteSchema.safeParse({ email: 'a@example.test', role: 'MEMBER' }).success, true)
  assert.equal(inviteSchema.safeParse({ email: 'a@example.test', role: 'OWNER' }).success, false)
})

test('role hierarchy prevents viewers mutating and admins escalating peer roles', () => {
  assert.equal(hasPermission(MembershipRole.VIEWER, 'tasks:update'), false)
  assert.equal(hasPermission(MembershipRole.MEMBER, 'tasks:create'), true)
  assert.equal(canInviteRole(MembershipRole.MANAGER, MembershipRole.ADMIN), false)
  assert.equal(canInviteRole(MembershipRole.OWNER, MembershipRole.ADMIN), true)
  assert.equal(canManageMemberRole(MembershipRole.ADMIN, MembershipRole.ADMIN, MembershipRole.MEMBER), false)
  assert.equal(canManageMemberRole(MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.MEMBER), true)
})

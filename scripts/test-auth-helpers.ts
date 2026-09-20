import { hashPassword, verifyPassword } from '../lib/auth/password'
import { initialsFromName, slugify } from '../lib/utils/identity'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const hash = hashPassword('password123')
assert(hash.startsWith('pbkdf2$sha512$120000$'), 'hash format')
assert(verifyPassword('password123', hash), 'verify matching password')
assert(!verifyPassword('wrong-password', hash), 'reject wrong password')
assert(initialsFromName('Alex Morgan') === 'AM', 'initials')
assert(slugify('Nexus Labs') === 'nexus-labs', 'slug')
console.log('Auth helpers passed.')

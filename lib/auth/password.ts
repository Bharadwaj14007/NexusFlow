import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const DIGEST = 'sha512'
const ITERATIONS = 120_000
const KEYLEN = 64

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex')
  return `pbkdf2$${DIGEST}$${ITERATIONS}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false

  const digest = parts[1]
  const iterations = Number(parts[2])
  const salt = parts[3]
  const hash = parts[4]
  if (!digest || !salt || !hash || !Number.isFinite(iterations) || iterations <= 0) return false

  const actual = pbkdf2Sync(password, salt, iterations, Buffer.from(hash, 'hex').length, digest)
  const expected = Buffer.from(hash, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

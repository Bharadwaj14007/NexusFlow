import { createHash, randomUUID } from 'node:crypto'
import { AppError } from '@/lib/errors'

function cloudinaryConfig() {
  const values = [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET]
  if (values.every((value) => !value)) return null
  if (values.some((value) => !value)) throw new AppError('CONFIGURATION', 'Cloudinary storage credentials are incomplete.', 503)
  return { cloudName: values[0]!, apiKey: values[1]!, apiSecret: values[2]! }
}

function signature(params: Record<string, string>, secret: string) {
  const canonical = Object.entries(params).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('&')
  return createHash('sha1').update(`${canonical}${secret}`).digest('hex')
}

export async function storeOriginalDocument(file: File, organizationId: string) {
  const config = cloudinaryConfig()
  if (!config) return null
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const folder = `nexusflow/${organizationId}`
  const publicId = randomUUID()
  const params = { folder, public_id: publicId, timestamp, type: 'authenticated' }
  const form = new FormData()
  form.set('file', file)
  form.set('api_key', config.apiKey)
  form.set('timestamp', timestamp)
  form.set('folder', folder)
  form.set('public_id', publicId)
  form.set('type', 'authenticated')
  form.set('signature', signature(params, config.apiSecret))
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/raw/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    console.error('Cloudinary document upload failed.', { status: response.status })
    throw new AppError('UPSTREAM', 'Unable to store the original document.', 502)
  }
  const result = await response.json() as { public_id?: string }
  if (!result.public_id) throw new AppError('UPSTREAM', 'Document storage returned an invalid response.', 502)
  return result.public_id
}

export async function deleteOriginalDocument(storageKey: string) {
  const config = cloudinaryConfig()
  if (!config) throw new AppError('CONFIGURATION', 'Configure Cloudinary storage before deleting this original file.', 503)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const params = { public_id: storageKey, timestamp, type: 'authenticated' }
  const form = new FormData()
  form.set('public_id', storageKey)
  form.set('api_key', config.apiKey)
  form.set('timestamp', timestamp)
  form.set('type', 'authenticated')
  form.set('signature', signature(params, config.apiSecret))
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/raw/destroy`, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    console.error('Cloudinary document deletion failed.', { status: response.status })
    throw new AppError('UPSTREAM', 'Unable to delete the original document from storage.', 502)
  }
  const result = await response.json() as { result?: string }
  if (result.result !== 'ok' && result.result !== 'not found') throw new AppError('UPSTREAM', 'Document storage did not confirm deletion.', 502)
}

export function isCloudinaryEnabled() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

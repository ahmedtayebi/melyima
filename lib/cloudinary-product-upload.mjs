import { createHash } from 'node:crypto'
import { cloudinaryBackupPublicId, productImageBackupUrl } from './product-image-sources.mjs'

/** @param {Uint8Array} bytes @param {string} mime @param {string} backupUrl @returns {Promise<string>} */
export async function uploadCloudinaryProductImage(bytes, mime, backupUrl, { timeoutMs = 15000 } = {}) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !/^[a-z0-9_-]+$/i.test(cloud) || !apiKey || !apiSecret) throw new Error('Cloudinary configuration is missing')

  const publicId = cloudinaryBackupPublicId(backupUrl)
  const params = { overwrite: 'false', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const signature = createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join('&') + apiSecret).digest('hex')
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(bytes)], { type: mime }), 'product-image')
  for (const [key, value] of Object.entries(params)) form.set(key, value)
  form.set('api_key', apiKey)
  form.set('signature', signature)
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    // Classify the error without logging echoed credentials, URLs or signatures.
    let message = ''
    try { const body = await response.json(); if (typeof body.error?.message === 'string') message = body.error.message } catch { /* no JSON error body */ }
    const reason = /public_id.*too long/i.test(message) ? 'public_id_too_long'
      : /invalid signature/i.test(message) ? 'invalid_signature'
      : /quota|usage limit/i.test(message) ? 'quota_exceeded' : 'request_rejected'
    throw new Error(`Cloudinary upload HTTP ${response.status} (${reason})`)
  }
  const result = await response.json()
  if (result.public_id !== publicId || typeof result.secure_url !== 'string') throw new Error('Unexpected Cloudinary upload response')
  const url = new URL(result.secure_url)
  if (!url.pathname.startsWith(`/${cloud}/image/upload/`) || productImageBackupUrl(url.href) !== backupUrl) {
    throw new Error('Cloudinary response does not match the saved backup')
  }
  return url.href.replace('/image/upload/', '/image/upload/f_auto,q_auto:good,c_limit,w_1600/')
}

import { cloudinaryBackupPublicId } from './product-image-sources.mjs'
import { uploadCloudinaryProductImage } from './cloudinary-product-upload.mjs'
import { imageFormat } from './product-image-storage.mjs'

export const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024

export function isReviewImageSource(value, origin = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    if (typeof value !== 'string') return false
    cloudinaryBackupPublicId(value, origin)
    return new URL(value).pathname.startsWith('/storage/v1/object/public/review-images/')
  } catch { return false }
}

export async function mirrorReviewImages(images, {
  origin = process.env.NEXT_PUBLIC_SUPABASE_URL,
  fetcher = fetch,
  upload = uploadCloudinaryProductImage,
} = {}) {
  if (!Array.isArray(images) || images.length > 3 || images.some(url => !isReviewImageSource(url, origin))) {
    throw new Error('Invalid review image URLs')
  }
  const result = new Map()
  for (const source of new Set(images)) {
    // Fetch only this project's public review bucket, never follow a redirect.
    const response = await fetcher(source, { redirect: 'error', signal: AbortSignal.timeout(15000) })
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_REVIEW_IMAGE_BYTES) {
      await response.body?.cancel()
      throw new Error('Review image download failed or exceeded limit')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Empty review image')
    const chunks = []; let length = 0
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > MAX_REVIEW_IMAGE_BYTES) throw new Error('Review image exceeded limit')
        chunks.push(value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const format = imageFormat(bytes)
    if (!format) throw new Error('Invalid review image content')
    result.set(source, await upload(bytes, format.mime, source))
  }
  return images.map(source => result.get(source))
}

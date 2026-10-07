export const PRODUCT_IMAGE_BUCKET = 'catalog-images'
export const MAX_PRODUCT_IMAGE_BYTES = 4 * 1024 * 1024

// Only raster formats. Do not trust the file extension or uploaded MIME type.
export function imageFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: 'jpg', mime: 'image/jpeg' }
  if ([137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return { extension: 'png', mime: 'image/png' }
  const text = new TextDecoder().decode(bytes.slice(0,12))
  if (text.startsWith('RIFF') && text.slice(8,12) === 'WEBP') return { extension: 'webp', mime: 'image/webp' }
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return { extension: 'gif', mime: 'image/gif' }
  return null
}

export async function ensureProductImageBucket(db) {
  let { data, error } = await db.storage.getBucket(PRODUCT_IMAGE_BUCKET)
  if (error && String(error.statusCode ?? error.status) === '404') {
    const created = await db.storage.createBucket(PRODUCT_IMAGE_BUCKET, {
      public: true, fileSizeLimit: MAX_PRODUCT_IMAGE_BYTES,
      allowedMimeTypes: ['image/jpeg','image/png','image/webp','image/gif'],
    })
    if (created.error) {
      const existing = await db.storage.getBucket(PRODUCT_IMAGE_BUCKET)
      data = existing.data; error = existing.error
    } else return
  }
  if (error || !data?.public) throw new Error('تعذّر الوصول إلى مخزن صور المنتجات العام في Supabase.')
}

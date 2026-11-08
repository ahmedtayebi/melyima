// Versioned public IDs preserve the exact backup path even in historical orders
// and persisted carts, without a second database lookup when the CDN is down.
const PREFIX = 'melyima/supabase-v1'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OBJECT = new RegExp(`^/storage/v1/object/public/catalog-images/products/(${UUID})/(${UUID})/(${UUID})\\.(jpg|png|webp|gif)$`, 'i')
const MIRROR = new RegExp(`/${PREFIX}/([^/]+)/catalog-images/(jpg|png|webp|gif)/products/(${UUID})/(${UUID})/(${UUID})(?:\\.[a-z0-9]+)?$`, 'i')
const EXTENDED_PREFIX = 'melyima/supabase-v2'
const EXTENDED_MIRROR = new RegExp(`/${EXTENDED_PREFIX}/([^/]+)/(review-images|product-images|catalog-images)/([a-f0-9]{2,1024})(?:\\.[a-z0-9]+)?$`, 'i')
const COMPACT_PREFIX = 'melyima/supabase-v3'
const COMPACT_MIRROR = new RegExp(`/${COMPACT_PREFIX}/([^/]+)/(review-images|product-images|catalog-images)/(.+)/asset(?:\\.[a-z0-9]+)?$`, 'i')

function storagePath(url) {
  const match = url.pathname.match(/^\/storage\/v1\/object\/public\/(review-images|product-images|catalog-images)\/(.+)$/)
  if (!match) throw new Error('Unsupported image bucket')
  const [, bucket, object] = match
  // Only literal, bounded ASCII raster paths. No URL escapes, traversal or queries.
  if (object.length > 512 || !/\.(jpg|jpeg|png|webp|gif)$/i.test(object) ||
      object.split('/').some(part => !/^[a-z0-9_.-]+$/i.test(part) || part === '.' || part === '..')) {
    throw new Error('Unsupported image object path')
  }
  return { bucket, object }
}

/** @param {string} backupUrl @param {string | undefined} [projectUrl] @returns {string} */
export function cloudinaryBackupPublicId(backupUrl, projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const project = new URL(projectUrl ?? '')
  const backup = new URL(backupUrl)
  const match = backup.pathname.match(OBJECT)
  if (backup.origin !== project.origin || backup.protocol !== 'https:' || backup.username || backup.password || backup.search || backup.hash || backup.href !== backupUrl) {
    throw new Error('Invalid product image backup URL')
  }
  if (!match) {
    const { bucket, object } = storagePath(backup)
    const encoded = Array.from(object, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    const extended = `${EXTENDED_PREFIX}/${project.host}/${bucket}/${encoded}`
    if (extended.length <= 255) return extended
    // Preserve older IDs. Long legacy paths must not double in length as hex.
    // A fixed trailing filename makes the original extension unambiguous.
    const compact = `${COMPACT_PREFIX}/${project.host}/${bucket}/${object}/asset`
    if (compact.length > 255) throw new Error('Image path exceeds Cloudinary public_id limit')
    return compact
  }
  const [, product, color, file, extension] = match
  return `${PREFIX}/${project.host}/catalog-images/${extension}/products/${product}/${color}/${file}`
}

/** @param {string} source @param {string | undefined} [projectUrl] @returns {string | null} */
export function productImageBackupUrl(source, projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const project = new URL(projectUrl ?? '')
    const primary = new URL(source)
    if (project.protocol !== 'https:' || primary.protocol !== 'https:' || primary.host !== 'res.cloudinary.com' || primary.username || primary.password ||
        !/^\/[^/]+\/image\/upload\//.test(primary.pathname)) return null
    const match = primary.pathname.match(MIRROR)
    if (!match) {
      const compact = primary.pathname.match(COMPACT_MIRROR)
      if (compact) {
        if (compact[1] !== project.host) return null
        const backup = new URL(`${project.origin}/storage/v1/object/public/${compact[2]}/${compact[3]}`)
        const parsed = storagePath(backup)
        return parsed.bucket === compact[2] && parsed.object === compact[3] ? backup.href : null
      }
      const extended = primary.pathname.match(EXTENDED_MIRROR)
      if (!extended || extended[1] !== project.host || extended[3].length % 2) return null
      const object = extended[3].match(/../g).map(hex => String.fromCharCode(parseInt(hex, 16))).join('')
      const backup = new URL(`${project.origin}/storage/v1/object/public/${extended[2]}/${object}`)
      const parsed = storagePath(backup)
      // URL parsing normalizes paths; reject anything that changed during parsing.
      if (parsed.bucket !== extended[2] || parsed.object !== object) return null
      return backup.href
    }
    if (match[1] !== project.host) return null
    const [, , extension, product, color, file] = match
    return `${project.origin}/storage/v1/object/public/catalog-images/products/${product}/${color}/${file}.${extension}`
  } catch {
    // Legacy Cloudinary URLs have no provable backup. Never guess a different photo.
    return null
  }
}

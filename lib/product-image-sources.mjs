// Versioned public IDs preserve the exact backup path even in historical orders
// and persisted carts, without a second database lookup when the CDN is down.
const PREFIX = 'melyima/supabase-v1'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OBJECT = new RegExp(`^/storage/v1/object/public/catalog-images/products/(${UUID})/(${UUID})/(${UUID})\\.(jpg|png|webp|gif)$`, 'i')
const MIRROR = new RegExp(`/${PREFIX}/([^/]+)/catalog-images/(jpg|png|webp|gif)/products/(${UUID})/(${UUID})/(${UUID})(?:\\.[a-z0-9]+)?$`, 'i')

/** @param {string} backupUrl @param {string | undefined} [projectUrl] @returns {string} */
export function cloudinaryBackupPublicId(backupUrl, projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const project = new URL(projectUrl ?? '')
  const backup = new URL(backupUrl)
  const match = backup.pathname.match(OBJECT)
  if (backup.origin !== project.origin || backup.protocol !== 'https:' || backup.username || backup.password || backup.search || backup.hash || !match) {
    throw new Error('Invalid product image backup URL')
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
    if (!match || match[1] !== project.host) return null
    const [, , extension, product, color, file] = match
    return `${project.origin}/storage/v1/object/public/catalog-images/products/${product}/${color}/${file}.${extension}`
  } catch {
    // Legacy Cloudinary URLs have no provable backup. Never guess a different photo.
    return null
  }
}

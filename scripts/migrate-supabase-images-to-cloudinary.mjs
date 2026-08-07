import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : null

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // The script can still run when env vars are provided by the shell.
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function signCloudinaryParams(params, apiSecret) {
  const payload = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex')
}

function isSupabaseProductImage(url) {
  try {
    const parsed = new URL(url)
    return parsed.hostname.endsWith('.supabase.co') &&
      parsed.pathname.includes('/storage/v1/object/public/product-images/')
  } catch {
    return false
  }
}

function optimizedCloudinaryUrl(url) {
  return url.replace('/image/upload/', '/image/upload/f_auto,q_auto:good,c_limit,w_1600/')
}

async function uploadRemoteImageToCloudinary({ oldUrl, imageId, colorId }) {
  const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME')
  const apiKey = requireEnv('CLOUDINARY_API_KEY')
  const apiSecret = requireEnv('CLOUDINARY_API_SECRET')
  const timestamp = String(Math.floor(Date.now() / 1000))
  const folder = `melyima/migrated-products/${colorId}`
  const uploadParams = {
    folder,
    overwrite: 'true',
    public_id: imageId,
    timestamp,
  }
  const signature = signCloudinaryParams(uploadParams, apiSecret)
  const form = new FormData()
  form.set('file', oldUrl)
  form.set('api_key', apiKey)
  form.set('folder', folder)
  form.set('overwrite', 'true')
  form.set('public_id', imageId)
  form.set('timestamp', timestamp)
  form.set('signature', signature)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const data = await res.json()

  if (!res.ok || typeof data.secure_url !== 'string') {
    throw new Error(data?.error?.message || 'Cloudinary upload failed')
  }

  return optimizedCloudinaryUrl(data.secure_url)
}

async function main() {
  loadEnvFile('.env.local')

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )

  const { data, error } = await supabase
    .from('product_color_images')
    .select('id, color_id, image_url, sort_order')
    .not('image_url', 'is', null)
    .order('color_id')
    .order('sort_order')

  if (error) throw new Error(error.message)

  const rows = (data ?? []).filter(row => row.image_url && isSupabaseProductImage(row.image_url))
  const selectedRows = Number.isFinite(limit) && limit > 0 ? rows.slice(0, limit) : rows
  const affectedColorIds = new Set()
  let migrated = 0
  let failed = 0

  console.log(`Found ${rows.length} Supabase product images to migrate.`)
  if (dryRun) {
    for (const row of selectedRows) {
      console.log(`[dry-run] ${row.id}: ${row.image_url}`)
    }
    console.log('Dry run only. No uploads or database updates were made.')
    return
  }

  for (const row of selectedRows) {
    try {
      console.log(`Migrating ${migrated + failed + 1}/${selectedRows.length}: ${row.id}`)
      const newUrl = await uploadRemoteImageToCloudinary({
        oldUrl: row.image_url,
        imageId: row.id,
        colorId: row.color_id,
      })

      const { error: imageUpdateError } = await supabase
        .from('product_color_images')
        .update({ image_url: newUrl })
        .eq('id', row.id)
      if (imageUpdateError) throw new Error(imageUpdateError.message)

      const { error: orderItemsUpdateError } = await supabase
        .from('order_items')
        .update({ color_image_url: newUrl })
        .eq('color_image_url', row.image_url)
      if (orderItemsUpdateError) throw new Error(orderItemsUpdateError.message)

      affectedColorIds.add(row.color_id)
      migrated += 1
      console.log(`  ok -> ${newUrl}`)
    } catch (err) {
      failed += 1
      console.error(`  failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (const colorId of affectedColorIds) {
    const { data: firstImage, error: firstImageError } = await supabase
      .from('product_color_images')
      .select('image_url')
      .eq('color_id', colorId)
      .order('sort_order')
      .limit(1)
      .maybeSingle()
    if (firstImageError) throw new Error(firstImageError.message)

    const { error: colorUpdateError } = await supabase
      .from('product_colors')
      .update({ image_url: firstImage?.image_url ?? null })
      .eq('id', colorId)
    if (colorUpdateError) throw new Error(colorUpdateError.message)
  }

  console.log(`Done. Migrated: ${migrated}. Failed: ${failed}. Updated colors: ${affectedColorIds.size}.`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

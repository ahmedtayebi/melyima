// Default is preparation ONLY. No production writes without --apply or --rollback.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { PRODUCT_IMAGE_BUCKET, MAX_PRODUCT_IMAGE_BYTES, imageFormat, ensureProductImageBucket } from '../lib/product-image-storage.mjs'

const columns = { product_color_images: 'image_url', product_colors: 'image_url', order_items: 'color_image_url' }
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export function isCloudinary(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.username && !u.password }
  catch { return false }
}
export async function downloadImage(url, fetcher = fetch) {
  // No credentials, cookies or redirects to arbitrary hosts.
  const res = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (!res.ok) { await res.body?.cancel(); throw new Error(`Download HTTP ${res.status}`) }
  if (Number(res.headers.get('content-length')) > MAX_PRODUCT_IMAGE_BYTES) {
    await res.body?.cancel(); throw new Error('Image exceeds 4 MiB')
  }
  const chunks = []; let size = 0
  for await (const chunk of res.body ?? []) {
    size += chunk.length
    if (size > MAX_PRODUCT_IMAGE_BYTES) throw new Error('Image exceeds 4 MiB')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (!imageFormat(bytes)) throw new Error('Response is not a supported raster image')
  return bytes
}
async function save(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 })
  await rename(`${file}.tmp`, file)
}
export async function replaceReference(db, row, from, to) {
  if (columns[row.table] !== row.field) throw new Error('Invalid image column')
  const { data, error } = await db.from(row.table).update({ [row.field]: to })
    .eq('id', row.id).eq(row.field, from).select('id')
  if (error) throw new Error(`Database update failed in ${row.table}`)
  if (data?.length) return 'updated'
  const current = await db.from(row.table).select(row.field).eq('id', row.id).maybeSingle()
  if (current.error) throw new Error(`Database read failed in ${row.table}`)
  if (current.data?.[row.field] === to) return 'already_updated'
  throw new Error(`Reference changed or deleted: ${row.table}/${row.id}`)
}
export async function collectReferences(db) {
  const rows = []
  for (const [table, field] of Object.entries(columns)) {
    let cursor
    for (;;) {
      let query = db.from(table).select(`id,${field}`).not(field, 'is', null).order('id').limit(500)
      if (cursor) query = query.gt('id', cursor)
      const { data, error } = await query
      if (error) throw new Error(`Cannot inventory ${table}`)
      for (const row of data ?? []) if (isCloudinary(row[field])) rows.push({ table, field, id: row.id, oldUrl: row[field] })
      if (!data?.length || data.length < 500) break
      cursor = data.at(-1).id
    }
  }
  return rows
}
export function validatePlan(plan, origin) {
  if (plan.version !== 1 || plan.origin !== origin || !Array.isArray(plan.rows) || !plan.assets) throw new Error('Wrong project or invalid plan')
  for (const row of plan.rows) {
    if (columns[row.table] !== row.field || typeof row.id !== 'string' || !isCloudinary(row.oldUrl) || !Object.hasOwn(plan.assets, row.oldUrl)) throw new Error('Invalid plan reference')
  }
  for (const asset of Object.values(plan.assets)) if (asset.hash) {
    if (!/^[a-f0-9]{64}$/.test(asset.hash) || !['jpg','png','gif','webp'].includes(asset.extension)) throw new Error('Invalid staged asset')
  }
}
async function main() {
  const args = process.argv.slice(2)
  if (args.some(a => !['--prepare','--apply','--rollback'].includes(a) && !a.startsWith('--plan=') && !a.startsWith('--map='))) throw new Error('Use --prepare, --apply or --rollback; optional --plan=PATH and --map=PATH')
  if (args.filter(a => ['--prepare','--apply','--rollback'].includes(a)).length > 1) throw new Error('Choose one operation')
  nextEnv.loadEnvConfig(process.cwd())
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  const db = createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const planFile = path.resolve(args.find(a => a.startsWith('--plan='))?.slice(7) ?? '.local/image-migration/plan.json')
  const cache = path.join(path.dirname(planFile), 'files')
  const cacheFile = asset => path.join(cache, `${asset.hash}.${asset.extension}`)
  const targetUrl = asset => db.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(`migrated/${asset.hash}.${asset.extension}`).data.publicUrl
  if (!args.includes('--apply') && !args.includes('--rollback')) {
    let previous
    try { previous = JSON.parse(await readFile(planFile, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
    if (previous?.applyStarted) throw new Error('Keep the applied plan for rollback. Choose a new --plan=PATH')
    const mapPath = args.find(a => a.startsWith('--map='))?.slice(6)
    const overrides = mapPath ? JSON.parse(await readFile(mapPath, 'utf8')) : {}
    const rows = await collectReferences(db)
    const plan = { version: 1, origin, preparedAt: new Date().toISOString(), rows, assets: {} }
    await mkdir(cache, { recursive: true, mode: 0o700 })
    let ready = 0
    const deniedClouds = new Set()
    for (const source of new Set(rows.map(r => r.oldUrl))) {
      try {
        let bytes
        const override = overrides[source]
        if (override) {
          if (typeof override !== 'string') throw new Error('Override must be a reviewed URL or local file path')
          if (override.startsWith('https://')) {
            const u = new URL(override)
            if (u.origin !== origin || !u.pathname.startsWith('/storage/v1/object/public/') || u.username || u.password) throw new Error('Only this project public Storage URLs are accepted as overrides')
            bytes = await downloadImage(override)
          } else {
            if ((await stat(override)).size > MAX_PRODUCT_IMAGE_BYTES) throw new Error('Image exceeds 4 MiB')
            bytes = await readFile(override)
          }
        } else {
          const cloud = new URL(source).pathname.split('/')[1]
          if (deniedClouds.has(cloud)) throw new Error('Cloudinary account access denied; provide a verified original')
          try { bytes = await downloadImage(source) }
          catch (e) { if (/HTTP (401|403)/.test(e.message)) deniedClouds.add(cloud); throw e }
        }
        const format = imageFormat(bytes)
        if (!format || bytes.length > MAX_PRODUCT_IMAGE_BYTES) throw new Error('Unsupported or oversized original')
        const asset = { hash: digest(bytes), ...format, bytes: bytes.length }
        await writeFile(cacheFile(asset), bytes, { mode: 0o600 })
        plan.assets[source] = asset; ready++
      } catch (e) { plan.assets[source] = { error: e.message } }
    }
    await save(planFile, plan)
    console.log(`Prepared ${rows.length} references, ${Object.keys(plan.assets).length} unique images. Ready: ${ready}. Blocked: ${Object.keys(plan.assets).length - ready}.`)
    console.log(`Plan: ${planFile}. No uploads or database changes made.`)
    return
  }
  const plan = JSON.parse(await readFile(planFile, 'utf8'))
  validatePlan(plan, origin)
  const rollback = args.includes('--rollback')
  if (rollback && !plan.applyStarted) throw new Error('This plan has never been applied')
  if (!rollback) {
    if (Object.values(plan.assets).some(a => !a.hash)) throw new Error('Unresolved images. Supply reviewed originals with --map=PATH and run --prepare again')
    // Check every staged file before the first remote write.
    for (const asset of Object.values(plan.assets)) {
      const bytes = await readFile(cacheFile(asset))
      if (digest(bytes) !== asset.hash || imageFormat(bytes)?.extension !== asset.extension || bytes.length > MAX_PRODUCT_IMAGE_BYTES) throw new Error('Staged image failed verification')
    }
    plan.applyStarted = new Date().toISOString()
    await save(planFile, plan)
    await ensureProductImageBucket(db)
    for (const asset of Object.values(plan.assets)) {
      const bytes = await readFile(cacheFile(asset))
      // Immutable, content-addressed files make retries safe. Never overwrite an existing object.
      const { error } = await db.storage.from(PRODUCT_IMAGE_BUCKET).upload(`migrated/${asset.hash}.${asset.extension}`, bytes, {
        contentType: imageFormat(bytes).mime, cacheControl: '31536000', upsert: false,
      })
      // A retry may return 'already exists'; trust only a matching public download.
      let publicBytes
      try { publicBytes = await downloadImage(targetUrl(asset)) }
      catch { throw new Error(error ? 'Upload failed; database unchanged' : 'Public image verification failed; database unchanged') }
      if (digest(publicBytes) !== asset.hash) throw new Error('Public image hash mismatch; database unchanged')
    }
  }
  let changed = 0; let conflicts = 0
  for (const row of plan.rows) {
    const asset = plan.assets[row.oldUrl]
    if (!asset.hash) continue
    const next = targetUrl(asset)
    try {
      await replaceReference(db, row, rollback ? next : row.oldUrl, rollback ? row.oldUrl : next)
      row.state = rollback ? 'rolled_back' : 'applied'; delete row.error; changed++
    } catch (e) { row.error = e.message; conflicts++ }
    await save(planFile, plan)
  }
  console.log(`${rollback ? 'Rollback' : 'Apply'}: ${changed} references complete, ${conflicts} conflicts/errors. Originals were not deleted.`)
  console.log('Refresh the storefront cache through the authenticated /api/admin/store-cache endpoint, then verify product and order images.')
  if (conflicts) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.error(e.message); process.exitCode = 1 })
}

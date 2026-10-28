// Read-only by default. Originals in Supabase are never deleted.
import { mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { cloudinaryBackupPublicId, productImageBackupUrl } from '../lib/product-image-sources.mjs'
import { uploadCloudinaryProductImage } from '../lib/cloudinary-product-upload.mjs'
import { imageFormat } from '../lib/product-image-storage.mjs'
import { collectReferences, downloadImage, digest, replaceReference } from './migrate-cloudinary-images-to-supabase.mjs'

const columns = { product_color_images: 'image_url', product_colors: 'image_url', order_items: 'color_image_url' }
const rowKey = row => JSON.stringify([row.table, row.id, row.field, row.oldUrl])
export function isMirrorSource(url, origin) {
  try { cloudinaryBackupPublicId(url, origin); return true } catch { return false }
}
export function validateJournal(journal, origin, cloud) {
  if (journal.version !== 1 || journal.origin !== origin || journal.cloud !== cloud ||
      !Array.isArray(journal.rows) || !journal.assets || Array.isArray(journal.assets)) throw new Error('Wrong project/cloud or invalid mirror journal')
  for (const row of journal.rows) {
    if (columns[row.table] !== row.field || typeof row.id !== 'string' ||
        !isMirrorSource(row.oldUrl, origin) || !Object.hasOwn(journal.assets, row.oldUrl)) throw new Error('Invalid mirror reference')
  }
  for (const [source, asset] of Object.entries(journal.assets)) {
    if (!isMirrorSource(source, origin) || !asset || (asset.hash && !/^[a-f0-9]{64}$/.test(asset.hash))) throw new Error('Invalid mirror asset')
    if (asset.primary) {
      validatePrimary(asset.primary, source, origin, cloud)
      if (!asset.hash) throw new Error('Missing source hash')
    }
  }
}
function validatePrimary(primary, source, origin, cloud) {
  if (productImageBackupUrl(primary, origin) !== source || !new URL(primary).pathname.startsWith(`/${cloud}/image/upload/`)) {
    throw new Error('Cloudinary image does not match its Supabase backup')
  }
}
export async function mirrorImages({ db, origin, cloud, mode = 'dry-run', journal, persist,
  download = downloadImage, upload = uploadCloudinaryProductImage, replace = replaceReference, log = console.log }) {
  if (!['dry-run', 'apply', 'rollback'].includes(mode)) throw new Error('Invalid mode')
  if (!cloud || !/^[a-z0-9_-]+$/i.test(cloud)) throw new Error('CLOUDINARY_CLOUD_NAME is required')
  journal ??= { version: 1, origin, cloud, rows: [], assets: {} }
  validateJournal(journal, origin, cloud)
  const current = mode === 'rollback' ? [] : await collectReferences(db, url => typeof url === 'string')
  const eligible = current.filter(row => isMirrorSource(row.oldUrl, origin))
  const images = new Set(eligible.map(row => row.oldUrl)).size
  log(`${eligible.length} eligible references / ${images} unique Supabase images. Other references left unchanged: ${current.length - eligible.length}.`)
  if (mode === 'dry-run') {
    log('Read-only inventory complete. No downloads, uploads or database changes. Use --apply to copy.')
    return { images, references: eligible.length, changed: 0, conflicts: 0 }
  }
  if (!persist) throw new Error('A persistent journal is required for writes')
  if (mode === 'apply') {
    const known = new Set(journal.rows.map(rowKey))
    for (const row of eligible) {
      if (!known.has(rowKey(row))) { journal.rows.push(row); known.add(rowKey(row)) }
      journal.assets[row.oldUrl] ??= {}
    }
  }
  await persist(journal)
  let changed = 0, conflicts = 0, completed = 0
  for (const [source, asset] of Object.entries(journal.assets)) {
    const rows = journal.rows.filter(row => row.oldUrl === source)
    if (!rows.length || (mode === 'rollback' && !asset.primary)) continue
    // A stale journal or a changed Storage object must not redirect to a different photo.
    const bytes = await download(source)
    const hash = digest(bytes), format = imageFormat(bytes)
    if (!format || (asset.hash && asset.hash !== hash)) throw new Error('Supabase original changed or is invalid; stopped before changing this image')
    asset.hash = hash
    await persist(journal)
    if (mode === 'apply') {
      if (!asset.primary) {
        const primary = await upload(bytes, format.mime, source)
        validatePrimary(primary, source, origin, cloud)
        asset.primary = primary
        // Record the upload before updating references, so an interrupted run can resume.
        await persist(journal)
      }
      // Compare the ORIGINAL bytes, not an optimized derivative (which changes the hash).
      const original = asset.primary.replace('/image/upload/f_auto,q_auto:good,c_limit,w_1600/', '/image/upload/')
      if (digest(await download(original)) !== hash) throw new Error('Cloudinary original verification failed; references for this image were not changed')
    }
    for (const row of rows) {
      try {
        await replace(db, row, mode === 'rollback' ? asset.primary : source, mode === 'rollback' ? source : asset.primary)
        row.state = mode === 'rollback' ? 'rolled_back' : 'applied'
        delete row.error; changed++
      } catch (error) {
        row.error = error.message; conflicts++
      }
      await persist(journal)
    }
    completed++
    log(`Verified ${completed}/${Object.keys(journal.assets).length} images; ${changed} references complete, ${conflicts} conflicts/errors.`)
  }
  log(`${mode}: ${changed} references complete, ${conflicts} conflicts/errors. Supabase originals retained.`)
  return { images, references: eligible.length, changed, conflicts }
}
async function main() {
  const args = process.argv.slice(2)
  if (args.some(arg => !['--dry-run', '--apply', '--rollback'].includes(arg)) || args.length > 1) {
    throw new Error('Use --dry-run (default), --apply, or --rollback')
  }
  nextEnv.loadEnvConfig(process.cwd())
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  const mode = args[0]?.slice(2) ?? 'dry-run'
  if (mode === 'apply' && (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) throw new Error('Cloudinary API credentials are missing')
  const db = createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const directory = path.resolve('.local/image-mirror')
  const file = path.join(directory, 'state.json'), lock = path.join(directory, 'run.lock')
  const persist = async value => {
    await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 })
    await rename(`${file}.tmp`, file)
  }
  let locked = false
  try {
    if (mode !== 'dry-run') {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      try { await mkdir(lock); locked = true }
      catch (error) {
        if (error.code !== 'EEXIST') throw error
        throw new Error('Mirror is locked. Check for another running copy; remove .local/image-mirror/run.lock only if the previous process has stopped.')
      }
    }
    let journal
    try { journal = JSON.parse(await readFile(file, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (mode === 'rollback' && !journal) throw new Error('No mirror journal to roll back')
    const result = await mirrorImages({ db, origin, cloud, mode, journal, persist })
    if (mode !== 'dry-run') {
      console.log('Journal: .local/image-mirror/state.json. Keep it for retries and rollback.')
      console.log('Refresh the storefront through the authenticated POST /api/admin/store-cache endpoint after writes.')
    }
    if (result.conflicts) process.exitCode = 1
  } finally {
    if (locked) await rmdir(lock)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}

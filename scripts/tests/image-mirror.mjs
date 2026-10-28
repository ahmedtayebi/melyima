import assert from 'node:assert/strict'
import { mirrorImages, validateJournal, isMirrorSource } from '../mirror-supabase-images-to-cloudinary.mjs'
import { cloudinaryBackupPublicId } from '../../lib/product-image-sources.mjs'

const origin = 'https://test.supabase.co', cloud = 'test-cloud'
const id = '11111111-1111-4111-8111-111111111111'
const source = `${origin}/storage/v1/object/public/catalog-images/products/${id}/${id}/${id}.jpg`
const primary = `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto:good,c_limit,w_1600/v123/${cloudinaryBackupPublicId(source, origin)}.jpg`
const original = primary.replace('/f_auto,q_auto:good,c_limit,w_1600/', '/')
const jpeg = Buffer.from([255,216,255,224,0,16])

function fixture() {
  const tables = {
    product_color_images: [{ id: 'gallery', image_url: source }],
    product_colors: [{ id: 'cover', image_url: source }],
    order_items: [{ id: 'order', color_image_url: source }],
  }
  let uploads = 0, writes = 0, downloads = 0, saves = 0, saved
  const db = { from(table) { return {
    select() { return this }, not() { return this }, order() { return this }, limit() { return this },
    then(resolve) { resolve({ data: tables[table], error: null }) },
  } } }
  const options = {
    db, origin, cloud, log() {},
    persist: async journal => { saves++; saved = structuredClone(journal) },
    download: async url => { downloads++; assert([source, original].includes(url)); return jpeg },
    upload: async (bytes, mime, backup) => { uploads++; assert.deepEqual(bytes, jpeg); assert.equal(mime, 'image/jpeg'); assert.equal(backup, source); return primary },
    replace: async (_, row, from, to) => {
      const record = tables[row.table].find(record => record.id === row.id)
      if (record?.[row.field] === to) return 'already_updated'
      if (record?.[row.field] !== from) throw new Error('Reference changed or deleted')
      assert(saved.assets[source].primary, 'upload mapping must be persisted before database writes')
      writes++; record[row.field] = to
    },
  }
  return { options, tables, state: () => ({ uploads, writes, downloads, saves, saved }) }
}

assert(isMirrorSource(source, origin))
for (const invalid of [source.replace('test.supabase.co', 'other.supabase.co'), source + '?token=secret',
  source.replace('/products/', '/migrated/'), primary, '/logo.png', source.replace('catalog-images', 'product-images')]) {
  assert(!isMirrorSource(invalid, origin))
}
const dry = fixture()
dry.tables.product_colors.push({ id: 'old', image_url: 'https://res.cloudinary.com/old/image/upload/photo.jpg' })
const preview = await mirrorImages(dry.options)
assert.equal(preview.images, 1); assert.equal(preview.references, 3)
assert.deepEqual(dry.state(), { uploads: 0, writes: 0, downloads: 0, saves: 0, saved: undefined })

const run = fixture()
const result = await mirrorImages({ ...run.options, mode: 'apply' })
assert.equal(result.changed, 3); assert.equal(result.conflicts, 0)
assert.equal(run.state().uploads, 1); assert.equal(run.state().writes, 3)
assert.equal(run.tables.order_items[0].color_image_url, primary)
// A subsequent catalog save may create another gallery row for the same backup.
run.tables.product_color_images.push({ id: 'new-gallery', image_url: source })
await mirrorImages({ ...run.options, mode: 'apply', journal: run.state().saved })
assert.equal(run.state().uploads, 1); assert.equal(run.state().writes, 4)
assert.equal(run.state().saved.rows.length, 4)
assert.equal(run.tables.product_color_images[1].image_url, primary)
await mirrorImages({ ...run.options, mode: 'rollback', journal: run.state().saved })
assert.equal(run.state().uploads, 1)
assert.equal(run.tables.product_colors[0].image_url, source)
assert.equal(run.tables.order_items[0].color_image_url, source)
await mirrorImages({ ...run.options, mode: 'apply', journal: run.state().saved })
assert.equal(run.state().uploads, 1, 'apply after rollback must reuse the verified mirror')

for (const failure of ['upload', 'download', 'hash']) {
  const broken = fixture()
  await assert.rejects(() => mirrorImages({ ...broken.options, mode: 'apply',
    upload: failure === 'upload' ? async () => { throw new Error('Cloudinary HTTP 401') } : broken.options.upload,
    download: async url => {
      if (url !== source && failure === 'download') throw new Error('CDN HTTP 401')
      return url !== source && failure === 'hash' ? Buffer.from([255,216,255,99]) : jpeg
    },
  }))
  assert.equal(broken.state().writes, 0)
  assert.equal(broken.tables.product_colors[0].image_url, source)
  if (failure !== 'upload') {
    await mirrorImages({ ...broken.options, mode: 'apply', journal: broken.state().saved })
    assert.equal(broken.state().uploads, 1, 'resume must not upload the same image again')
    assert.equal(broken.state().writes, 3)
  }
}
const concurrent = fixture()
const conflictResult = await mirrorImages({ ...concurrent.options, mode: 'apply', replace: async (...args) => {
  if (args[1].table === 'product_colors') concurrent.tables.product_colors[0].image_url = 'concurrent-admin-photo'
  return concurrent.options.replace(...args)
} })
assert.equal(conflictResult.conflicts, 1); assert.equal(conflictResult.changed, 2)
assert.equal(concurrent.tables.product_colors[0].image_url, 'concurrent-admin-photo')
assert.match(concurrent.state().saved.rows.find(row => row.table === 'product_colors').error, /changed/)

const state = run.state().saved
validateJournal(state, origin, cloud)
assert.throws(() => validateJournal(state, 'https://other.supabase.co', cloud), /project/)
assert.throws(() => validateJournal(state, origin, 'other-cloud'), /cloud/)
const forged = structuredClone(state); forged.assets[source].primary = primary.replace('/test-cloud/', '/other-cloud/')
assert.throws(() => validateJournal(forged, origin, cloud), /backup/)
const changed = fixture()
await assert.rejects(() => mirrorImages({ ...changed.options, mode: 'apply', journal: state,
  download: async () => Buffer.from([255,216,255,99]),
}), /original changed/)
assert.equal(changed.state().uploads, 0); assert.equal(changed.state().writes, 0)
console.log('PASS: read-only mirror inventory, source restrictions, unique copy for gallery/cover/orders, hash verification, interrupted retry, concurrent edits, rollback and project guards')

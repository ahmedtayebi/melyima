import { collectReferences, replaceReference } from './migrate-cloudinary-images-to-supabase.mjs'

export async function collectMirrorReferences(db) {
  const rows = await collectReferences(db, url => typeof url === 'string')
  let cursor
  for (;;) {
    let query = db.from('reviews').select('id,images').order('id').limit(500)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw new Error('Cannot inventory reviews')
    for (const review of data ?? []) {
      if (!Array.isArray(review.images)) continue
      review.images.forEach((url, index) => {
        if (typeof url === 'string') rows.push({ table: 'reviews', field: 'images', id: review.id, index, oldUrl: url })
      })
    }
    if (!data?.length || data.length < 500) break
    cursor = data.at(-1).id
  }
  return rows
}

export async function replaceMirrorReference(db, row, from, to) {
  if (row.table !== 'reviews') return replaceReference(db, row, from, to)
  if (row.field !== 'images' || !Number.isInteger(row.index) || row.index < 0) throw new Error('Invalid review image reference')
  const current = await db.from('reviews').select('images').eq('id', row.id).maybeSingle()
  if (current.error) throw new Error('Cannot read review images')
  const images = current.data?.images
  if (!Array.isArray(images)) throw new Error('Review changed or deleted')
  if (images[row.index] === to) return 'already_updated'
  if (images[row.index] !== from) throw new Error('Review image changed or moved')
  const next = [...images]; next[row.index] = to
  // reviews.images is text[]. Match the entire current array so that concurrent
  // reordering, edits or deletion cannot be silently overwritten.
  const arrayLiteral = `{${images.map(url => JSON.stringify(url)).join(',')}}`
  const { data, error } = await db.from('reviews').update({ images: next })
    .eq('id', row.id).eq('images', arrayLiteral).select('id')
  if (error || !data?.length) throw new Error('Review changed during image replacement')
  return 'updated'
}

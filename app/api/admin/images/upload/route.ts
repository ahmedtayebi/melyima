import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/ecotrack/_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRODUCT_IMAGE_BUCKET, MAX_PRODUCT_IMAGE_BYTES, imageFormat, ensureProductImageBucket } from '@/lib/product-image-storage.mjs'

export const runtime = 'nodejs'
export const maxDuration = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const form = await req.formData()
    const file = form.get('file')
    const product = String(form.get('product_id') ?? '')
    const color = String(form.get('color_id') ?? '')
    if (!(file instanceof File) || !UUID.test(product) || !UUID.test(color)) {
      return NextResponse.json({ success: false, error: 'الصورة أو معرّفات المنتج واللون غير صحيحة.' }, { status: 400 })
    }
    if (!file.size || file.size > MAX_PRODUCT_IMAGE_BYTES) {
      return NextResponse.json({ success: false, error: 'الحد الأقصى للصورة بعد الضغط 4MB.' }, { status: 413 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const format = imageFormat(bytes)
    if (!format) return NextResponse.json({ success: false, error: 'استخدمي صورة JPEG أو PNG أو WebP أو GIF.' }, { status: 400 })
    const db = createAdminClient()
    await ensureProductImageBucket(db)
    const path = `products/${product}/${color}/${randomUUID()}.${format.extension}`
    const { error } = await db.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, bytes, {
      contentType: format.mime, cacheControl: '31536000', upsert: false,
    })
    if (error) throw new Error('تعذّر رفع الصورة إلى Supabase.')
    const { data } = db.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
    return NextResponse.json({ success: true, url: data.publicUrl }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ success: false, error: 'تعذّر رفع الصورة إلى Supabase. تحققي من إعدادات التخزين وحاولي مجددًا.' }, { status: 500 })
  }
}

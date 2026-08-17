import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/ecotrack/_auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_IMAGE_SIZE = 20 * 1024 * 1024

function formatFileSize(bytes: number) {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`
}

function signCloudinaryParams(params: Record<string, string>, apiSecret: string) {
  const payload = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex')
}

function optimizedCloudinaryUrl(url: string) {
  return url.replace('/image/upload/', '/image/upload/f_auto,q_auto:good,c_limit,w_1600/')
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('Cloudinary environment variables are required')
      return NextResponse.json(
        { success: false, error: 'إعدادات Cloudinary غير مكتملة' },
        { status: 500 }
      )
    }

    let incoming: FormData
    try {
      incoming = await req.formData()
    } catch (err) {
      console.error('Invalid upload form data:', err)
      return NextResponse.json(
        { success: false, error: 'تعذّر قراءة الصورة، جرّب صورة أصغر أو أعد المحاولة' },
        { status: 400 }
      )
    }
    const file = incoming.get('file')
    const productId = String(incoming.get('product_id') ?? '').trim()
    const colorId = String(incoming.get('color_id') ?? '').trim()

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'لم يتم إرسال صورة صحيحة' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'الملف يجب أن يكون صورة' },
        { status: 400 }
      )
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { success: false, error: `حجم الصورة كبير جداً، الحد الأقصى ${formatFileSize(MAX_IMAGE_SIZE)}` },
        { status: 400 }
      )
    }

    const timestamp = String(Math.floor(Date.now() / 1000))
    const folder = `melyima/products/${productId || 'unknown'}/${colorId || 'unknown'}`
    const uploadParams = { folder, timestamp }
    const signature = signCloudinaryParams(uploadParams, apiSecret)

    const cloudinaryForm = new FormData()
    cloudinaryForm.set('file', file)
    cloudinaryForm.set('api_key', apiKey)
    cloudinaryForm.set('folder', folder)
    cloudinaryForm.set('timestamp', timestamp)
    cloudinaryForm.set('signature', signature)

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: cloudinaryForm,
    })
    const result = await uploadRes.json()

    if (!uploadRes.ok || typeof result.secure_url !== 'string') {
      console.error('Cloudinary upload error:', result)
      return NextResponse.json(
        { success: false, error: 'تعذّر رفع الصورة إلى Cloudinary' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      url: optimizedCloudinaryUrl(result.secure_url),
      original_url: result.secure_url,
      public_id: result.public_id ?? null,
    })
  } catch (err) {
    console.error('Unexpected Cloudinary upload error:', err)
    return NextResponse.json(
      { success: false, error: 'خطأ في رفع الصورة' },
      { status: 500 }
    )
  }
}

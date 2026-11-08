import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isReviewImageSource, mirrorReviewImages } from '@/lib/review-image-mirror.mjs'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const { customer_name, rating, comment, images } = await req.json()

    if (typeof customer_name !== 'string' || !customer_name.trim() || customer_name.length > 200 ||
        typeof comment !== 'string' || !comment.trim() || comment.length > 10000) {
      return NextResponse.json(
        { success: false, error: 'جميع الحقول مطلوبة' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'التقييم يجب أن يكون بين 1 و 5' },
        { status: 400 }
      )
    }

    if (images !== undefined && (!Array.isArray(images) || images.length > 3 || images.some(url => !isReviewImageSource(url)))) {
      return NextResponse.json(
        { success: false, error: 'رابط الصورة غير مسموح به' },
        { status: 400 }
      )
    }

    let primaryImages: string[]
    try {
      primaryImages = await mirrorReviewImages(images ?? [])
    } catch {
      return NextResponse.json(
        { success: false, error: 'تعذّر تجهيز الصور. لم تُرسل المراجعة؛ حاولي مجددًا.' },
        { status: 502 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
    )

    const { error } = await supabase
      .from('reviews')
      .insert({
        customer_name: String(customer_name).trim(),
        rating: Number(rating),
        comment: String(comment).trim(),
        status: 'pending',
        images: primaryImages,
      })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'حدث خطأ، حاولي مجدداً' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم' },
      { status: 500 }
    )
  }
}

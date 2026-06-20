import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimitPublicApi } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const rateLimited = await rateLimitPublicApi(req, 'reviews')
    if (rateLimited) return rateLimited

    const { customer_name, rating, comment, images } = await req.json()

    if (!customer_name?.trim() || !rating || !comment?.trim()) {
      return NextResponse.json(
        { success: false, error: 'جميع الحقول مطلوبة' },
        { status: 400 }
      )
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'التقييم يجب أن يكون بين 1 و 5' },
        { status: 400 }
      )
    }

    const safeImages: string[] = Array.isArray(images)
      ? images.filter((u: unknown) => typeof u === 'string').slice(0, 3)
      : []

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
        images: safeImages,
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

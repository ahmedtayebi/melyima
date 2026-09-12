import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/ecotrack/_auth'

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    let productId: string | null = null
    try {
      const body = await request.json()
      productId = typeof body?.productId === 'string' ? body.productId : null
    } catch {
      productId = null
    }

    revalidatePath('/')
    revalidatePath('/new-arrivals')
    revalidatePath('/best-sellers')
    revalidatePath('/discounts')
    revalidatePath('/sitemap.xml')
    revalidatePath('/category/[id]', 'page')
    revalidatePath('/products/[id]', 'page')
    revalidatePath('/(store)', 'layout')

    if (productId) {
      revalidatePath(`/products/${productId}`)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Store cache revalidation failed:', err)
    return NextResponse.json(
      { success: false, error: 'تعذّر تحديث صفحات المتجر' },
      { status: 500 }
    )
  }
}

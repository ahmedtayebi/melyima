import { invalidateStoreCache } from '@/lib/store-cache'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/ecotrack/_auth'

export async function POST() {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    invalidateStoreCache()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Store cache revalidation failed:', err)
    return NextResponse.json(
      { success: false, error: 'تعذّر تحديث صفحات المتجر' },
      { status: 500 }
    )
  }
}

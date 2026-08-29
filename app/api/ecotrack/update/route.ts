import { NextResponse } from 'next/server'
import { requireAdmin } from '../_auth'

export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  return NextResponse.json(
    { success: false, error: 'استخدمي نافذة تعديل الطلب لضمان تحديث المخزون وEcotrack معًا' },
    { status: 410 }
  )
}

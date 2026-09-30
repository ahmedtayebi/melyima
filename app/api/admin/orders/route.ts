import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/ecotrack/_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdminOrders } from '@/lib/admin-orders'

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const supabase = createAdminClient()

    const orders = await loadAdminOrders(supabase)
    return NextResponse.json({ success: true, orders }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('Unexpected admin orders refresh error:', err)
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم' },
      { status: 500 }
    )
  }
}

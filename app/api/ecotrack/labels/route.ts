import { NextResponse } from 'next/server'
import { requireAdmin } from '../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { canPrintLabel, type LabelOrder } from '@/lib/order-labels'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const db = createAdminClient()
    const orders: LabelOrder[] = []
    // Explicit pagination: "select all" must include records beyond Supabase's
    // default response limit, with a stable unique ordering between pages.
    let cursor: string | null = null
    while (true) {
      let query = db.from('orders')
        .select('id,customer_name,wilaya_name,created_at,status,deleted_at,ecotrack_status,ecotrack_tracking')
        .eq('status', 'confirmed').eq('ecotrack_status', 'draft')
        .is('deleted_at', null).not('ecotrack_tracking', 'is', null)
        .order('id', { ascending: true }).limit(500)
      if (cursor) query = query.gt('id', cursor)
      const { data, error } = await query
      if (error) throw error
      const rows = (data ?? []) as LabelOrder[]
      orders.push(...rows.filter(canPrintLabel))
      if (rows.length < 500) break
      cursor = rows[rows.length - 1].id
    }
    orders.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    return NextResponse.json({ success: true, orders }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ success: false, error: 'تعذّر تحميل البوالص الجاهزة للشحن.' }, { status: 500 })
  }
}

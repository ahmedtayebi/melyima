import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/app/api/ecotrack/_auth'

const ORDERS_SELECT = `
  id, customer_name, phone, phone2, wilaya, wilaya_name, commune,
  delivery_type, delivery_price, products_total, total_price, address,
  status, notes, created_at, updated_at,
  deleted_at, deleted_from_status,
  ecotrack_tracking, ecotrack_status,
  order_items!inner(id, order_id, product_id, color_id, size_id, product_name, color_name, color_hex, color_image_url, size_label, quantity)
`

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase service role missing' },
        { status: 500 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const { data, error } = await supabase
      .from('orders')
      .select(ORDERS_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Admin orders refresh error:', error)
      return NextResponse.json(
        { success: false, error: 'تعذّر جلب الطلبات' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, orders: data ?? [] })
  } catch (err) {
    console.error('Unexpected admin orders refresh error:', err)
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم' },
      { status: 500 }
    )
  }
}

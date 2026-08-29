import { NextRequest, NextResponse } from 'next/server'
import { ecotrackShipOrder } from '@/lib/ecotrack'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../_auth'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const { order_id } = await req.json()
    if (!UUID_PATTERN.test(String(order_id ?? ''))) {
      return NextResponse.json({ success: false, error: 'معرّف الطلب غير صحيح' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, deleted_at, ecotrack_tracking, ecotrack_status')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (order.deleted_at) {
      return NextResponse.json({ success: false, error: 'الطلب موجود في المحذوفات' }, { status: 409 })
    }
    if (order.ecotrack_status === 'shipped') {
      return NextResponse.json({ success: true, already_shipped: true })
    }
    if (order.status !== 'confirmed' || order.ecotrack_status !== 'draft' || !order.ecotrack_tracking) {
      return NextResponse.json({ success: false, error: 'لا توجد مسودة جاهزة للإرسال' }, { status: 409 })
    }

    const result = await ecotrackShipOrder(order.ecotrack_tracking)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    }

    const { data: savedOrder, error: dbError } = await supabase
      .from('orders')
      .update({ ecotrack_status: 'shipped' })
      .eq('id', order_id)
      .eq('status', 'confirmed')
      .eq('ecotrack_status', 'draft')
      .eq('ecotrack_tracking', order.ecotrack_tracking)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()

    if (dbError || !savedOrder) {
      const { data: latestOrder } = await supabase
        .from('orders')
        .select('ecotrack_status')
        .eq('id', order_id)
        .maybeSingle()

      if (latestOrder?.ecotrack_status !== 'shipped') {
        console.error('Ecotrack order shipped but local status update failed:', order_id, dbError)
        return NextResponse.json({ success: true, pending_sync: true })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected Ecotrack shipping error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

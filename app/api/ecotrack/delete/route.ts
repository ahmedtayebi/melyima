import { NextRequest, NextResponse } from 'next/server'
import { ecotrackDeleteOrder } from '@/lib/ecotrack'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../_auth'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest) {
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
    if (!order.ecotrack_tracking) {
      return NextResponse.json({ success: true, already_deleted: true })
    }
    if (order.deleted_at || order.status !== 'confirmed' || order.ecotrack_status !== 'draft') {
      return NextResponse.json({ success: false, error: 'لا يمكن حذف هذه البوليصة' }, { status: 409 })
    }

    const result = await ecotrackDeleteOrder(order.ecotrack_tracking)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    }

    const { data: savedOrder, error: dbError } = await supabase
      .from('orders')
      .update({ ecotrack_tracking: null, ecotrack_status: 'none' })
      .eq('id', order_id)
      .eq('ecotrack_tracking', order.ecotrack_tracking)
      .eq('ecotrack_status', 'draft')
      .select('id')
      .maybeSingle()

    if (dbError || !savedOrder) {
      console.error('Ecotrack draft deleted but local cleanup failed:', order_id, dbError)
      return NextResponse.json({ success: true, pending_cleanup: true })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected Ecotrack draft deletion error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

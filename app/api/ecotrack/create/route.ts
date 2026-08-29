import { NextRequest, NextResponse } from 'next/server'
import {
  ecotrackCreateOrder,
  ecotrackDeleteOrder,
  ecotrackGetStopDeskCommune,
  WILAYA_CODES,
  WILAYA_CODE_BY_NUMBER,
} from '@/lib/ecotrack'
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
      .select('*, order_items(product_name, color_name, size_label, quantity)')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (order.deleted_at) return NextResponse.json({ success: false, error: 'الطلب موجود في المحذوفات' }, { status: 409 })
    if (order.status !== 'confirmed' || order.ecotrack_status === 'shipped') {
      return NextResponse.json({ success: false, error: 'يجب أن يكون الطلب مؤكدًا قبل إنشاء البوليصة' }, { status: 409 })
    }
    if (order.ecotrack_tracking) return NextResponse.json({ success: true, tracking: order.ecotrack_tracking, already_exists: true })

    const code_wilaya =
      WILAYA_CODES[order.wilaya] ??
      WILAYA_CODE_BY_NUMBER[order.wilaya] ??
      WILAYA_CODE_BY_NUMBER[String(parseInt(order.wilaya))] ??
      0
    if (!code_wilaya) return NextResponse.json({ success: false, error: `Wilaya not found: ${order.wilaya}` }, { status: 400 })

    const produit = (order.order_items ?? [])
      .map((i: { product_name: string; color_name: string; size_label: string; quantity: number }) =>
        `${i.product_name} - ${i.color_name} - ${i.size_label} x${i.quantity}`
      )
      .join(', ')
      .substring(0, 255)
    const fallbackCommune = order.commune ?? order.wilaya_name ?? order.wilaya
    const stopDesk = order.delivery_type === 'office' ? 1 : 0
    let ecotrackCommune = fallbackCommune

    if (stopDesk === 1 && !order.commune) {
      const stopDeskCommune = await ecotrackGetStopDeskCommune(code_wilaya)
      if (!stopDeskCommune.success || !stopDeskCommune.commune) {
        return NextResponse.json(
          { success: false, error: 'لا توجد بلدية مكتب متاحة لهذه الولاية في Ecotrack' },
          { status: 400 }
        )
      }
      ecotrackCommune = stopDeskCommune.commune
    }

    const result = await ecotrackCreateOrder({
      nom_client: order.customer_name,
      telephone: order.phone,
      telephone_2: order.phone2 ?? undefined,
      adresse: String(order.address ?? fallbackCommune).substring(0, 255),
      commune: ecotrackCommune,
      code_wilaya,
      montant: order.total_price,
      stop_desk: stopDesk,
      produit,
      reference: order.id.slice(-8).toUpperCase(),
    })

    if (!result.success || !result.tracking) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    }

    const { data: savedOrder, error: dbError } = await supabase
      .from('orders')
      .update({ ecotrack_tracking: result.tracking, ecotrack_status: 'draft' })
      .eq('id', order_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .is('ecotrack_tracking', null)
      .select('id')
      .maybeSingle()

    if (dbError || !savedOrder) {
      const cleanup = await ecotrackDeleteOrder(result.tracking)
      if (!cleanup.success) {
        console.error('Failed to remove unlinked Ecotrack draft:', result.tracking, cleanup.message)
      }

      const { data: latestOrder } = await supabase
        .from('orders')
        .select('ecotrack_tracking')
        .eq('id', order_id)
        .maybeSingle()

      if (latestOrder?.ecotrack_tracking) {
        return NextResponse.json({
          success: true,
          tracking: latestOrder.ecotrack_tracking,
          already_exists: true,
        })
      }

      return NextResponse.json({ success: false, error: 'تعذّر حفظ بوليصة التوصيل' }, { status: 500 })
    }

    return NextResponse.json({ success: true, tracking: result.tracking })
  } catch (error) {
    console.error('Unexpected Ecotrack draft creation error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

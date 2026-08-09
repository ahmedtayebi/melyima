import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/app/api/ecotrack/_auth'
import { ecotrackDeleteOrder } from '@/lib/ecotrack'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface Props {
  params: Promise<{ id: string }>
}

export async function DELETE(_: Request, { params }: Props) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { success: false, error: 'معرّف الطلب غير صحيح' },
        { status: 400 }
      )
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is required for deleting orders')
      return NextResponse.json(
        { success: false, error: 'تعذّر حذف الطلب' },
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

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, ecotrack_tracking, ecotrack_status')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      return NextResponse.json(
        { success: false, error: 'الطلب غير موجود' },
        { status: 404 }
      )
    }

    if (order.ecotrack_tracking) {
      const ecotrackResult = await ecotrackDeleteOrder(order.ecotrack_tracking)

      if (!ecotrackResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: ecotrackResult.message || 'تعذّر حذف البوليصة من شركة التوصيل',
          },
          { status: 502 }
        )
      }
    }

    const { data: restoredItems, error: orderError } = await supabase.rpc(
      'delete_order_with_stock',
      { p_order_id: id }
    )

    if (orderError) {
      console.error('Order delete RPC error:', orderError)
      if (order.ecotrack_tracking) {
        await supabase
          .from('orders')
          .update({ ecotrack_tracking: null, ecotrack_status: 'none' })
          .eq('id', id)
      }
      return NextResponse.json(
        { success: false, error: 'تعذّر حذف الطلب' },
        { status: orderError.message.includes('order_not_found') ? 404 : 500 }
      )
    }

    return NextResponse.json({ success: true, restored_items: restoredItems ?? 0 })
  } catch (err) {
    console.error('Unexpected error in DELETE /api/orders/[id]:', err)
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم' },
      { status: 500 }
    )
  }
}

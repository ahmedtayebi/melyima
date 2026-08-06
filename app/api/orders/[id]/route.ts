import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/app/api/ecotrack/_auth'

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

    const { error: itemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', id)

    if (itemsError) {
      console.error('Order items delete error:', itemsError)
      return NextResponse.json(
        { success: false, error: 'تعذّر حذف عناصر الطلب' },
        { status: 500 }
      )
    }

    const { data: deletedOrder, error: orderError } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)
      .select('id')
      .single()

    if (orderError || !deletedOrder) {
      console.error('Order delete error:', orderError)
      return NextResponse.json(
        { success: false, error: 'تعذّر حذف الطلب' },
        { status: orderError?.code === 'PGRST116' ? 404 : 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in DELETE /api/orders/[id]:', err)
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم' },
      { status: 500 }
    )
  }
}

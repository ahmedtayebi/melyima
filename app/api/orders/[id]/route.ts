import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/app/api/ecotrack/_auth'
import { ecotrackDeleteOrder } from '@/lib/ecotrack'
import { DELIVERY_PRICES } from '@/lib/delivery-prices'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PHONE_PATTERN = /^0[567]\d{8}$/
const MAX_ITEMS = 50
const MAX_QUANTITY_PER_ITEM = 20

interface Props {
  params: Promise<{ id: string }>
}

type IncomingOrderItem = {
  product_id?: unknown
  color_id?: unknown
  size_id?: unknown
  quantity?: unknown
}

function adminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

function normalizePhone(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim()
}

function orderError(message: string) {
  if (message.includes('insufficient_stock')) {
    return { status: 409, error: 'المخزون غير كافٍ لأحد المنتجات أو المقاسات' }
  }
  if (message.includes('product_unavailable')) {
    return { status: 409, error: 'أحد المنتجات أو الخيارات لم يعد متاحًا' }
  }
  if (message.includes('duplicate_order_items')) {
    return { status: 400, error: 'نفس المنتج واللون والمقاس مكرر داخل الطلب' }
  }
  if (message.includes('order_locked')) {
    return { status: 409, error: 'لا يمكن تعديل هذا الطلب بعد إرساله للشحن' }
  }
  if (message.includes('order_not_found')) {
    return { status: 404, error: 'الطلب غير موجود' }
  }
  return { status: 400, error: 'تعذّر تنفيذ العملية على الطلب' }
}

async function getOrderId(params: Props['params']) {
  const { id } = await params
  return UUID_PATTERN.test(id) ? id : null
}

export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const id = await getOrderId(params)
    if (!id) {
      return NextResponse.json({ success: false, error: 'معرّف الطلب غير صحيح' }, { status: 400 })
    }

    const supabase = adminClient()
    const permanent = req.nextUrl.searchParams.get('permanent') === '1'

    if (permanent) {
      const { error } = await supabase.rpc('permanently_delete_order', { p_order_id: id })
      if (error) {
        const mapped = orderError(error.message)
        return NextResponse.json({ success: false, error: mapped.error }, { status: mapped.status })
      }
      return NextResponse.json({ success: true, permanent: true })
    }

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, deleted_at, ecotrack_tracking, ecotrack_status')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (order.deleted_at) {
      return NextResponse.json({ success: false, error: 'الطلب موجود في المحذوفات بالفعل' }, { status: 409 })
    }
    if (order.status === 'delivered' || order.ecotrack_status === 'shipped') {
      return NextResponse.json(
        { success: false, error: 'لا يمكن حذف طلب تم إرساله للشحن أو تسليمه' },
        { status: 409 }
      )
    }

    if (order.ecotrack_tracking) {
      const ecotrackResult = await ecotrackDeleteOrder(order.ecotrack_tracking)
      if (!ecotrackResult.success) {
        return NextResponse.json(
          { success: false, error: ecotrackResult.message || 'تعذّر حذف البوليصة من شركة التوصيل' },
          { status: 502 }
        )
      }
    }

    const { data: restoredItems, error } = await supabase.rpc('delete_order_with_stock', {
      p_order_id: id,
    })

    if (error) {
      if (order.ecotrack_tracking) {
        await supabase
          .from('orders')
          .update({ ecotrack_tracking: null, ecotrack_status: 'none' })
          .eq('id', id)
      }
      const mapped = orderError(error.message)
      return NextResponse.json({ success: false, error: mapped.error }, { status: mapped.status })
    }

    return NextResponse.json({ success: true, restored_items: restoredItems ?? 0 })
  } catch (error) {
    console.error('Unexpected DELETE /api/orders/[id] error:', error)
    return NextResponse.json({ success: false, error: 'خطأ في الخادم' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const id = await getOrderId(params)
    if (!id) {
      return NextResponse.json({ success: false, error: 'معرّف الطلب غير صحيح' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action
    const supabase = adminClient()

    if (action === 'restore') {
      const { data: reservedItems, error } = await supabase.rpc('restore_order_with_stock', {
        p_order_id: id,
      })
      if (error) {
        const mapped = orderError(error.message)
        return NextResponse.json({ success: false, error: mapped.error }, { status: mapped.status })
      }
      return NextResponse.json({ success: true, status: 'pending', reserved_items: reservedItems ?? 0 })
    }

    if (action !== 'pending') {
      return NextResponse.json({ success: false, error: 'العملية غير صحيحة' }, { status: 400 })
    }

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, deleted_at, ecotrack_tracking, ecotrack_status')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (order.deleted_at || order.status !== 'confirmed') {
      return NextResponse.json({ success: false, error: 'يمكن إرجاع الطلب المؤكد فقط' }, { status: 409 })
    }
    if (order.ecotrack_status === 'shipped') {
      return NextResponse.json({ success: false, error: 'لا يمكن إرجاع طلب أُرسل للشحن' }, { status: 409 })
    }

    if (order.ecotrack_tracking) {
      const result = await ecotrackDeleteOrder(order.ecotrack_tracking)
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.message || 'تعذّر حذف مسودة Ecotrack' },
          { status: 502 }
        )
      }
    }

    const { error } = await supabase
      .from('orders')
      .update({ status: 'pending', ecotrack_tracking: null, ecotrack_status: 'none' })
      .eq('id', id)
      .is('deleted_at', null)

    if (error) {
      return NextResponse.json({ success: false, error: 'تعذّر تحديث حالة الطلب' }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: 'pending' })
  } catch (error) {
    console.error('Unexpected PATCH /api/orders/[id] error:', error)
    return NextResponse.json({ success: false, error: 'خطأ في الخادم' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Props) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const id = await getOrderId(params)
    if (!id) {
      return NextResponse.json({ success: false, error: 'معرّف الطلب غير صحيح' }, { status: 400 })
    }

    const body = await req.json()
    const customerName = String(body.customer_name ?? '').trim()
    const phone = normalizePhone(body.phone)
    const phone2 = normalizePhone(body.phone2) || null
    const wilaya = String(body.wilaya ?? '').padStart(2, '0')
    const deliveryType = String(body.delivery_type ?? '')
    const commune = String(body.commune ?? '').trim()
    const address = String(body.address ?? '').trim()
    const notes = String(body.notes ?? '').trim()
    const items = Array.isArray(body.items) ? body.items as IncomingOrderItem[] : []

    if (notes.length > 1000) {
      return NextResponse.json({ success: false, error: 'الملاحظة طويلة جدًا' }, { status: 400 })
    }

    const supabase = adminClient()
    const { data: currentOrder, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, notes, deleted_at, ecotrack_tracking, ecotrack_status')
      .eq('id', id)
      .single()

    if (fetchError || !currentOrder) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (currentOrder.deleted_at) {
      return NextResponse.json({ success: false, error: 'استرجع الطلب من المحذوفات قبل تعديله' }, { status: 409 })
    }

    if (
      currentOrder.status === 'delivered' ||
      currentOrder.status === 'cancelled' ||
      currentOrder.ecotrack_status === 'shipped'
    ) {
      const { error } = await supabase.from('orders').update({ notes: notes || null }).eq('id', id)
      if (error) {
        return NextResponse.json({ success: false, error: 'تعذّر حفظ الملاحظة' }, { status: 500 })
      }
      return NextResponse.json({ success: true, limited: true })
    }

    if (
      !customerName || customerName.length > 100 ||
      !PHONE_PATTERN.test(phone) ||
      (phone2 && !PHONE_PATTERN.test(phone2)) ||
      !['home', 'office'].includes(deliveryType) ||
      !commune || commune.length > 150 ||
      (deliveryType === 'home' && !address) ||
      address.length > 500 ||
      items.length === 0 || items.length > MAX_ITEMS ||
      items.some(item =>
        !UUID_PATTERN.test(String(item.product_id ?? '')) ||
        !UUID_PATTERN.test(String(item.color_id ?? '')) ||
        !UUID_PATTERN.test(String(item.size_id ?? '')) ||
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        Number(item.quantity) > MAX_QUANTITY_PER_ITEM
      )
    ) {
      return NextResponse.json({ success: false, error: 'بيانات الطلب غير مكتملة أو غير صحيحة' }, { status: 400 })
    }

    const deliveryEntry = DELIVERY_PRICES.find(entry => entry.code === wilaya)
    if (!deliveryEntry) {
      return NextResponse.json({ success: false, error: 'الولاية غير صحيحة' }, { status: 400 })
    }

    if (!['pending', 'confirmed'].includes(currentOrder.status)) {
      return NextResponse.json({ success: false, error: 'لا يمكن تعديل الطلب بهذه الحالة' }, { status: 409 })
    }

    if (currentOrder.status === 'confirmed' && currentOrder.ecotrack_tracking) {
      const result = await ecotrackDeleteOrder(currentOrder.ecotrack_tracking)
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.message || 'تعذّر حذف مسودة Ecotrack قبل التعديل' },
          { status: 502 }
        )
      }
    }

    if (currentOrder.status === 'confirmed') {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'pending', ecotrack_tracking: null, ecotrack_status: 'none' })
        .eq('id', id)
      if (error) {
        return NextResponse.json({ success: false, error: 'تعذّر تجهيز الطلب للتعديل' }, { status: 500 })
      }
    }

    const deliveryPrice = deliveryType === 'home' ? deliveryEntry.home : deliveryEntry.office
    const rpcItems = items.map(item => ({
      product_id: String(item.product_id),
      color_id: String(item.color_id),
      size_id: String(item.size_id),
      quantity: Number(item.quantity),
    }))

    const { data: totals, error } = await supabase.rpc('update_order_with_stock', {
      p_order_id: id,
      p_customer_name: customerName,
      p_phone: phone,
      p_phone2: phone2,
      p_wilaya: deliveryEntry.code,
      p_wilaya_name: deliveryEntry.name,
      p_delivery_type: deliveryType,
      p_delivery_price: deliveryPrice,
      p_address: deliveryType === 'home' ? address : null,
      p_commune: commune,
      p_notes: notes || null,
      p_items: rpcItems,
    })

    if (error) {
      const mapped = orderError(error.message)
      return NextResponse.json({ success: false, error: mapped.error }, { status: mapped.status })
    }

    return NextResponse.json({ success: true, status: 'pending', totals })
  } catch (error) {
    console.error('Unexpected PUT /api/orders/[id] error:', error)
    return NextResponse.json({ success: false, error: 'خطأ في الخادم' }, { status: 500 })
  }
}

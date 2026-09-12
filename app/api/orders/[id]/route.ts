import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/ecotrack/_auth'
import { ecotrackUpdateOrder, WILAYA_CODE_BY_NUMBER } from '@/lib/ecotrack'
import { DELIVERY_PRICES } from '@/lib/delivery-prices'
import {
  ensureEcotrackDraft,
  isInvalidEcotrackTracking,
  recoverEcotrackTracking,
  removeEcotrackDraft,
} from '@/lib/order-ecotrack'
import { createAdminClient } from '@/lib/supabase/admin'

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

type StoredOrderItem = {
  product_id: string | null
  color_id: string | null
  size_id: string | null
  product_name: string
  color_name: string
  size_label: string
  quantity: number
}

type EditableProduct = {
  id: string
  name: string
  price: number
  product_colors: { id: string; name: string }[]
  product_sizes: { id: string; label: string }[]
  product_variants: { color_id: string; size_id: string; stock: number }[]
}

function itemKey(productId: string, colorId: string, sizeId: string) {
  return `${productId}:${colorId}:${sizeId}`
}

function productDescription(items: StoredOrderItem[]) {
  return items
    .map(item => `${item.product_name} - ${item.color_name} - ${item.size_label} x${item.quantity}`)
    .join(', ')
    .substring(0, 255)
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
  if (message.includes('order_changed')) {
    return { status: 409, error: 'تغيّر الطلب أثناء العملية، حدّثي الصفحة ثم حاولي مجددًا' }
  }
  return { status: 400, error: 'تعذّر تنفيذ العملية على الطلب' }
}

async function restoreUnlimitedStockOrder(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string
) {
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('product_id, color_id, size_id')
    .eq('order_id', orderId)

  if (itemsError || !items?.length) return { restored: false, databaseError: Boolean(itemsError) }
  if (items.some(item => !item.product_id || !item.color_id || !item.size_id)) {
    return { restored: false, databaseError: false }
  }

  const productIds = [...new Set(items.map(item => item.product_id as string))]
  const colorIds = [...new Set(items.map(item => item.color_id as string))]
  const sizeIds = [...new Set(items.map(item => item.size_id as string))]

  const [productsResult, colorsResult, sizesResult, variantsResult] = await Promise.all([
    supabase.from('products').select('id').in('id', productIds),
    supabase.from('product_colors').select('id, product_id').in('id', colorIds),
    supabase.from('product_sizes').select('id, product_id').in('id', sizeIds),
    supabase
      .from('product_variants')
      .select('product_id, color_id, size_id')
      .in('product_id', productIds)
      .in('color_id', colorIds)
      .in('size_id', sizeIds),
  ])

  if (productsResult.error || colorsResult.error || sizesResult.error || variantsResult.error) {
    return { restored: false, databaseError: true }
  }

  const productSet = new Set((productsResult.data ?? []).map(product => product.id))
  const colorSet = new Set(
    (colorsResult.data ?? []).map(color => `${color.product_id}:${color.id}`)
  )
  const sizeSet = new Set(
    (sizesResult.data ?? []).map(size => `${size.product_id}:${size.id}`)
  )
  const variantSet = new Set(
    (variantsResult.data ?? []).map(variant =>
      `${variant.product_id}:${variant.color_id}:${variant.size_id}`
    )
  )

  const allOptionsExist = items.every(item =>
    productSet.has(item.product_id as string) &&
    colorSet.has(`${item.product_id}:${item.color_id}`) &&
    sizeSet.has(`${item.product_id}:${item.size_id}`)
  )
  const allItemsUseUnlimitedStock = items.every(item =>
    !variantSet.has(`${item.product_id}:${item.color_id}:${item.size_id}`)
  )

  if (!allOptionsExist || !allItemsUseUnlimitedStock) {
    return { restored: false, databaseError: false }
  }

  const { data: restoredOrder, error: restoreError } = await supabase
    .from('orders')
    .update({
      deleted_at: null,
      deleted_from_status: null,
      status: 'pending',
      ecotrack_tracking: null,
      ecotrack_status: 'none',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .not('deleted_at', 'is', null)
    .select('id')
    .maybeSingle()

  if (restoreError) return { restored: false, databaseError: true }
  if (restoredOrder) return { restored: true, databaseError: false }

  const { data: currentOrder } = await supabase
    .from('orders')
    .select('status, deleted_at')
    .eq('id', orderId)
    .maybeSingle()

  return {
    restored: Boolean(currentOrder && !currentOrder.deleted_at && currentOrder.status === 'pending'),
    databaseError: false,
  }
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

    const supabase = createAdminClient()
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

    let activeTracking = order.ecotrack_tracking
    if (activeTracking) {
      const ecotrackResult = await removeEcotrackDraft(supabase, id, activeTracking)
      if (!ecotrackResult.success) {
        return NextResponse.json(
          { success: false, error: ecotrackResult.error || 'تعذّر حذف البوليصة من شركة التوصيل' },
          { status: ecotrackResult.status ?? 502 }
        )
      }
      activeTracking = ecotrackResult.tracking
    }

    const { data: restoredItems, error } = await supabase.rpc('delete_order_with_stock', {
      p_order_id: id,
      p_expected_tracking: activeTracking,
    })

    if (error) {
      const { data: latestOrder } = await supabase
        .from('orders')
        .select('deleted_at')
        .eq('id', id)
        .maybeSingle()

      if (latestOrder?.deleted_at) {
        return NextResponse.json({ success: true, already_deleted: true, restored_items: 0 })
      }

      if (activeTracking) {
        await supabase
          .from('orders')
          .update({ ecotrack_tracking: null, ecotrack_status: 'none' })
          .eq('id', id)
          .eq('ecotrack_tracking', activeTracking)
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
    const supabase = createAdminClient()

    if (action === 'confirm') {
      const { data: confirmedOrder, error } = await supabase
        .from('orders')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .select('id')
        .maybeSingle()

      if (error) {
        return NextResponse.json({ success: false, error: 'تعذّر تأكيد الطلب' }, { status: 500 })
      }
      if (!confirmedOrder) {
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('status, deleted_at')
          .eq('id', id)
          .maybeSingle()

        if (existingOrder?.status === 'confirmed' && !existingOrder.deleted_at) {
          return NextResponse.json({ success: true, status: 'confirmed', already_confirmed: true })
        }
        return NextResponse.json({ success: false, error: 'يمكن تأكيد طلب قيد الانتظار فقط' }, { status: 409 })
      }

      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    if (action === 'restore') {
      const { data: reservedItems, error } = await supabase.rpc('restore_order_with_stock', {
        p_order_id: id,
      })
      if (error) {
        if (error.message.includes('product_unavailable')) {
          const compatibilityRestore = await restoreUnlimitedStockOrder(supabase, id)
          if (compatibilityRestore.restored) {
            return NextResponse.json({
              success: true,
              status: 'pending',
              legacy_unlimited_stock: true,
              reserved_items: 0,
            })
          }
          if (compatibilityRestore.databaseError) {
            return NextResponse.json(
              { success: false, error: 'تعذّر التحقق من مخزون الطلب' },
              { status: 500 }
            )
          }
        }

        const { data: latestOrder } = await supabase
          .from('orders')
          .select('status, deleted_at')
          .eq('id', id)
          .maybeSingle()

        if (latestOrder && !latestOrder.deleted_at && latestOrder.status === 'pending') {
          return NextResponse.json({ success: true, status: 'pending', already_restored: true, reserved_items: 0 })
        }

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

    let activeTracking = order.ecotrack_tracking
    if (activeTracking) {
      const result = await removeEcotrackDraft(supabase, id, activeTracking)
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'تعذّر حذف مسودة Ecotrack' },
          { status: result.status ?? 502 }
        )
      }
      activeTracking = result.tracking
    }

    let pendingUpdate = supabase
      .from('orders')
      .update({ status: 'pending', ecotrack_tracking: null, ecotrack_status: 'none' })
      .eq('id', id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)

    pendingUpdate = activeTracking
      ? pendingUpdate.eq('ecotrack_tracking', activeTracking)
      : pendingUpdate.is('ecotrack_tracking', null)

    const { data: pendingOrder, error } = await pendingUpdate
      .select('id')
      .maybeSingle()

    if (error || !pendingOrder) {
      if (activeTracking) {
        const { error: cleanupError } = await supabase
          .from('orders')
          .update({ ecotrack_tracking: null, ecotrack_status: 'none' })
          .eq('id', id)
          .eq('ecotrack_tracking', activeTracking)
        if (cleanupError) {
          console.error('Ecotrack draft deleted but local tracking cleanup failed:', id, cleanupError)
        }
      }

      const { data: latestOrder } = await supabase
        .from('orders')
        .select('status, ecotrack_tracking')
        .eq('id', id)
        .maybeSingle()

      if (latestOrder?.status === 'pending' && !latestOrder.ecotrack_tracking) {
        return NextResponse.json({ success: true, status: 'pending', already_pending: true })
      }

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

    const supabase = createAdminClient()
    const { data: currentOrder, error: fetchError } = await supabase
      .from('orders')
      .select(`
        id, customer_name, phone, phone2, wilaya, wilaya_name, commune,
        delivery_type, delivery_price, products_total, total_price, address,
        status, notes, deleted_at, ecotrack_tracking, ecotrack_status,
        order_items(product_id, color_id, size_id, product_name, color_name, size_label, quantity)
      `)
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

    const deliveryPrice = deliveryType === 'home' ? deliveryEntry.home : deliveryEntry.office
    const rpcItems = items.map(item => ({
      product_id: String(item.product_id),
      color_id: String(item.color_id),
      size_id: String(item.size_id),
      quantity: Number(item.quantity),
    }))

    const combinations = rpcItems.map(item => itemKey(item.product_id, item.color_id, item.size_id))
    if (new Set(combinations).size !== combinations.length) {
      return NextResponse.json(
        { success: false, error: 'نفس المنتج واللون والمقاس مكرر داخل الطلب' },
        { status: 400 }
      )
    }

    const productIds = [...new Set(rpcItems.map(item => item.product_id))]
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select(`
        id, name, price,
        product_colors(id, name),
        product_sizes(id, label),
        product_variants(color_id, size_id, stock)
      `)
      .in('id', productIds)

    if (productError) {
      return NextResponse.json({ success: false, error: 'تعذّر التحقق من المنتجات' }, { status: 500 })
    }

    const products = new Map(
      ((productData ?? []) as EditableProduct[]).map(product => [product.id, product])
    )
    const oldQuantities = new Map<string, number>()
    for (const item of (currentOrder.order_items ?? []) as StoredOrderItem[]) {
      if (!item.product_id || !item.color_id || !item.size_id) continue
      const key = itemKey(item.product_id, item.color_id, item.size_id)
      oldQuantities.set(key, (oldQuantities.get(key) ?? 0) + item.quantity)
    }

    let productsTotal = 0
    const productLabels: string[] = []
    for (const item of rpcItems) {
      const product = products.get(item.product_id)
      const color = product?.product_colors.find(entry => entry.id === item.color_id)
      const size = product?.product_sizes.find(entry => entry.id === item.size_id)

      if (!product || !color || !size) {
        return NextResponse.json(
          { success: false, error: 'أحد المنتجات أو الخيارات لم يعد متاحًا' },
          { status: 409 }
        )
      }

      const variant = product.product_variants.find(entry =>
        entry.color_id === item.color_id && entry.size_id === item.size_id
      )
      const availableStock = variant
        ? variant.stock + (oldQuantities.get(itemKey(item.product_id, item.color_id, item.size_id)) ?? 0)
        : null

      if (availableStock !== null && availableStock < item.quantity) {
        return NextResponse.json(
          { success: false, error: 'المخزون غير كافٍ لأحد المنتجات أو المقاسات' },
          { status: 409 }
        )
      }

      productsTotal += Number(product.price) * item.quantity
      productLabels.push(`${product.name} - ${color.name} - ${size.label} x${item.quantity}`)
    }

    const nextEcotrackData = {
      client: customerName,
      adresse: (deliveryType === 'home' ? address : commune).substring(0, 255),
      commune,
      wilaya: Number(deliveryEntry.code),
      montant: productsTotal + deliveryPrice,
      tel: phone,
      tel2: phone2 ?? '',
      product: productLabels.join(', ').substring(0, 255),
      stop_desk: deliveryType === 'office' ? 1 : 0,
    }
    const previousEcotrackData = {
      client: currentOrder.customer_name,
      adresse: String(
        currentOrder.address ?? currentOrder.commune ?? currentOrder.wilaya_name ?? currentOrder.wilaya
      ).substring(0, 255),
      commune: currentOrder.commune ?? currentOrder.wilaya_name ?? currentOrder.wilaya,
      wilaya: WILAYA_CODE_BY_NUMBER[currentOrder.wilaya] ?? Number(currentOrder.wilaya),
      montant: Number(currentOrder.total_price),
      tel: currentOrder.phone,
      tel2: currentOrder.phone2 ?? '',
      product: productDescription((currentOrder.order_items ?? []) as StoredOrderItem[]),
      stop_desk: currentOrder.delivery_type === 'office' ? 1 : 0,
    }

    const shouldUpdateEcotrack =
      currentOrder.status === 'confirmed' &&
      currentOrder.ecotrack_status === 'draft' &&
      Boolean(currentOrder.ecotrack_tracking)
    let activeEcotrackTracking = currentOrder.ecotrack_tracking as string | null
    let ecotrackDraftUpdated = false
    let ecotrackRelinked = false
    let staleEcotrackDraft = false

    if (shouldUpdateEcotrack) {
      let result = await ecotrackUpdateOrder(activeEcotrackTracking!, nextEcotrackData)
      if (!result.success) {
        if (isInvalidEcotrackTracking(result.message)) {
          const recovery = await recoverEcotrackTracking(supabase, id)
          if (!recovery.success || recovery.ambiguous) {
            return NextResponse.json(
              { success: false, error: recovery.error || 'تعذّر إصلاح رقم تتبع Ecotrack' },
              { status: recovery.status ?? 502 }
            )
          }

          if (recovery.recovered && recovery.tracking && recovery.mapped) {
            if (recovery.mapped.ecotrack_status !== 'draft') {
              return NextResponse.json(
                {
                  success: false,
                  error: 'تم تحديث حالة الطلب من Ecotrack ولم يعد قابلاً للتعديل؛ أغلقي النافذة وحدّثي الصفحة',
                },
                { status: 409 }
              )
            }

            if (recovery.tracking === activeEcotrackTracking) {
              return NextResponse.json(
                { success: false, error: result.message || 'Ecotrack رفض تعديل هذه البوليصة' },
                { status: 502 }
              )
            }

            activeEcotrackTracking = recovery.tracking
            ecotrackRelinked = true
            result = await ecotrackUpdateOrder(activeEcotrackTracking, nextEcotrackData)
            if (!result.success) {
              return NextResponse.json(
                { success: false, error: result.message || 'تعذّر تحديث مسودة Ecotrack' },
                { status: 502 }
              )
            }
            ecotrackDraftUpdated = true
          } else {
            const { data: clearedOrder, error: clearError } = await supabase
              .from('orders')
              .update({ ecotrack_tracking: null, ecotrack_status: 'none' })
              .eq('id', id)
              .eq('status', 'confirmed')
              .eq('ecotrack_status', 'draft')
              .eq('ecotrack_tracking', activeEcotrackTracking!)
              .is('deleted_at', null)
              .select('id')
              .maybeSingle()

            if (clearError || !clearedOrder) {
              return NextResponse.json(
                { success: false, error: 'تغيّرت حالة الطلب، حدّثي الصفحة ثم حاولي مجددًا' },
                { status: 409 }
              )
            }
            activeEcotrackTracking = null
            staleEcotrackDraft = true
          }
        } else {
          return NextResponse.json(
            { success: false, error: result.message || 'تعذّر تحديث مسودة Ecotrack' },
            { status: 502 }
          )
        }
      } else {
        ecotrackDraftUpdated = true
      }
    }

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
      if (ecotrackDraftUpdated && activeEcotrackTracking) {
        const rollback = await ecotrackUpdateOrder(activeEcotrackTracking, previousEcotrackData)
        if (!rollback.success) {
          console.error('Failed to restore Ecotrack draft after order update error:', rollback.message)
        }
      }
      const mapped = orderError(error.message)
      return NextResponse.json({ success: false, error: mapped.error }, { status: mapped.status })
    }

    if (staleEcotrackDraft) {
      const replacement = await ensureEcotrackDraft(supabase, id)
      if (!replacement.success || !replacement.tracking) {
        return NextResponse.json({
          success: true,
          status: currentOrder.status,
          totals,
          warning: replacement.error || 'تم حفظ الطلب، لكن تعذّر إعادة إنشاء مسودة Ecotrack',
        })
      }

      return NextResponse.json({
        success: true,
        status: currentOrder.status,
        totals,
        ecotrack_recreated: true,
        ecotrack_tracking: replacement.tracking,
      })
    }

    return NextResponse.json({
      success: true,
      status: currentOrder.status,
      totals,
      ecotrack_relinked: ecotrackRelinked,
      ecotrack_tracking: ecotrackRelinked ? activeEcotrackTracking : undefined,
    })
  } catch (error) {
    console.error('Unexpected PUT /api/orders/[id] error:', error)
    return NextResponse.json({ success: false, error: 'خطأ في الخادم' }, { status: 500 })
  }
}

import { after, NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { DELIVERY_PRICES } from '@/lib/delivery-prices'
import { sendNewOrderNotification } from '@/lib/order-notification-email'

type IncomingOrderItem = {
  product_id: string
  color_id: string
  size_id: string
  quantity: number
}

const MAX_ITEMS = 50
const MAX_QUANTITY_PER_ITEM = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeWilayaCode(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return raw.padStart(2, '0')
  return raw
}

function normalizePhone(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim()
}

function getOrderErrorMessage(message: string) {
  if (message.includes('insufficient_stock')) {
    return { status: 400, error: 'المنتج غير متوفر بالكمية المطلوبة' }
  }

  if (message.includes('product_unavailable')) {
    return { status: 400, error: 'منتج غير متوفر' }
  }

  if (
    message.includes('invalid_order_items') ||
    message.includes('invalid_delivery_type') ||
    message.includes('invalid_delivery_price') ||
    message.includes('invalid_address') ||
    message.includes('invalid_customer') ||
    message.includes('invalid_phone')
  ) {
    return { status: 400, error: 'بيانات غير مكتملة' }
  }

  return { status: 500, error: 'تعذّر إنشاء الطلب' }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      customer_name, phone, phone2, wilaya, commune,
      delivery_type, address, notes, items, request_id,
    } = body

    // ── Validate ──────────────────────────────────────────────
    const safeItems = Array.isArray(items) ? (items as Partial<IncomingOrderItem>[]) : []
    const customerName = String(customer_name ?? '').trim()
    const phoneNormalized = normalizePhone(phone)
    const phone2Normalized = phone2 ? normalizePhone(phone2) : null
    const wilayaCode = normalizeWilayaCode(wilaya)
    const communeNormalized = String(commune ?? '').trim()
    const addressNormalized = String(address ?? '').trim()
    const notesNormalized = String(notes ?? '').trim()
    const requestId = UUID_PATTERN.test(String(request_id ?? ''))
      ? String(request_id)
      : randomUUID()

    if (
      !customerName ||
      customerName.length > 100 ||
      !phoneNormalized ||
      !/^0[567]\d{8}$/.test(phoneNormalized) ||
      (phone2Normalized && !/^0[567]\d{8}$/.test(phone2Normalized)) ||
      !wilayaCode ||
      communeNormalized.length > 150 ||
      addressNormalized.length > 500 ||
      notesNormalized.length > 1000 ||
      safeItems.length === 0 ||
      safeItems.length > MAX_ITEMS ||
      safeItems.some((item) =>
        !item.product_id ||
        !UUID_PATTERN.test(String(item.product_id)) ||
        !item.color_id ||
        !UUID_PATTERN.test(String(item.color_id)) ||
        !item.size_id ||
        !UUID_PATTERN.test(String(item.size_id)) ||
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        Number(item.quantity) > MAX_QUANTITY_PER_ITEM
      )
    ) {
      return NextResponse.json(
        { success: false, error: 'بيانات غير مكتملة' },
        { status: 400 }
      )
    }

    const itemKeys = safeItems.map(item =>
      `${String(item.product_id)}:${String(item.color_id)}:${String(item.size_id)}`
    )
    if (new Set(itemKeys).size !== itemKeys.length) {
      return NextResponse.json(
        { success: false, error: 'نفس المنتج واللون والمقاس مكرر داخل الطلب' },
        { status: 400 }
      )
    }

    if (!['home', 'office'].includes(delivery_type)) {
      return NextResponse.json(
        { success: false, error: 'نوع التوصيل غير صحيح' },
        { status: 400 }
      )
    }

    const deliveryEntry = DELIVERY_PRICES.find(entry => entry.code === wilayaCode)
    if (!deliveryEntry) {
      return NextResponse.json(
        { success: false, error: 'الولاية غير صحيحة' },
        { status: 400 }
      )
    }

    if (delivery_type === 'home' && (!communeNormalized || !addressNormalized)) {
      return NextResponse.json(
        { success: false, error: 'العنوان والبلدية مطلوبان للتوصيل للمنزل' },
        { status: 400 }
      )
    }

    if (delivery_type === 'office' && !communeNormalized) {
      return NextResponse.json(
        { success: false, error: 'يرجى اختيار مكتب الاستلام' },
        { status: 400 }
      )
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is required for atomic order creation')
      return NextResponse.json(
        { success: false, error: 'تعذّر إنشاء الطلب' },
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

    const deliveryPrice = delivery_type === 'home' ? deliveryEntry.home : deliveryEntry.office
    const rpcItems = safeItems.map(item => ({
      product_id: String(item.product_id),
      color_id: String(item.color_id),
      size_id: String(item.size_id),
      quantity: Number(item.quantity),
    }))

    const { data: orderResult, error: orderError } = await supabase.rpc('create_order_with_stock', {
      p_customer_name: customerName,
      p_phone: phoneNormalized,
      p_phone2: phone2Normalized,
      p_wilaya: wilayaCode,
      p_wilaya_name: deliveryEntry.name,
      p_delivery_type: String(delivery_type),
      p_delivery_price: deliveryPrice,
      p_address: delivery_type === 'home' ? addressNormalized : null,
      p_commune: communeNormalized,
      p_notes: notesNormalized || null,
      p_items: rpcItems,
      p_request_id: requestId,
    })

    const orderId = orderResult && typeof orderResult === 'object' && 'order_id' in orderResult
      ? String(orderResult.order_id)
      : ''
    const orderCreated = orderResult && typeof orderResult === 'object' && 'created' in orderResult
      ? orderResult.created !== false
      : false

    if (orderError || !UUID_PATTERN.test(orderId)) {
      console.error('Order RPC error:', orderError)
      const mapped = getOrderErrorMessage(orderError?.message ?? '')
      return NextResponse.json(
        { success: false, error: mapped.error },
        { status: mapped.status }
      )
    }

    const savedOrderId = orderId
    if (orderCreated) {
      after(async () => {
        try {
          await sendNewOrderNotification(savedOrderId)
        } catch (emailError) {
          console.error('New order notification email failed:', emailError)
        }
      })
    }

    return NextResponse.json({ success: true, order_id: savedOrderId })
  } catch (err) {
    console.error('Unexpected error in POST /api/orders:', err)
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم، حاولي مجدداً' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DELIVERY_PRICES } from '@/lib/delivery-prices'
import { rateLimitPublicApi } from '@/lib/rate-limit'

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
    const rateLimited = await rateLimitPublicApi(req, 'orders')
    if (rateLimited) return rateLimited

    const body = await req.json()
    const {
      customer_name, phone, phone2, wilaya, commune,
      delivery_type, address, notes, items,
    } = body

    // ── Validate ──────────────────────────────────────────────
    const safeItems = Array.isArray(items) ? (items as Partial<IncomingOrderItem>[]) : []
    const phoneNormalized = normalizePhone(phone)
    const phone2Normalized = phone2 ? normalizePhone(phone2) : null
    const wilayaCode = normalizeWilayaCode(wilaya)

    if (
      !customer_name?.trim() ||
      !phoneNormalized ||
      !/^0[567]\d{8}$/.test(phoneNormalized) ||
      (phone2Normalized && !/^0[567]\d{8}$/.test(phone2Normalized)) ||
      !wilayaCode ||
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

    if (delivery_type === 'home' && (!String(commune ?? '').trim() || !String(address ?? '').trim())) {
      return NextResponse.json(
        { success: false, error: 'العنوان والبلدية مطلوبان للتوصيل للمنزل' },
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

    const { data: orderId, error: orderError } = await supabase.rpc('create_order_with_stock', {
      p_customer_name: String(customer_name).trim(),
      p_phone: phoneNormalized,
      p_phone2: phone2Normalized,
      p_wilaya: wilayaCode,
      p_wilaya_name: deliveryEntry.name,
      p_delivery_type: String(delivery_type),
      p_delivery_price: deliveryPrice,
      p_address: address ? String(address).trim() : null,
      p_commune: commune ? String(commune).trim() : null,
      p_notes: notes ? String(notes).trim() : null,
      p_items: rpcItems,
    })

    if (orderError || !orderId) {
      console.error('Order RPC error:', orderError)
      const mapped = getOrderErrorMessage(orderError?.message ?? '')
      return NextResponse.json(
        { success: false, error: mapped.error },
        { status: mapped.status }
      )
    }

    return NextResponse.json({ success: true, order_id: orderId })
  } catch (err) {
    console.error('Unexpected error in POST /api/orders:', err)
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم، حاولي مجدداً' },
      { status: 500 }
    )
  }
}

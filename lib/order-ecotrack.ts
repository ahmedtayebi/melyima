import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ecotrackCreateOrder,
  ecotrackDeleteOrder,
  ecotrackGetStopDeskCommune,
  WILAYA_CODES,
  WILAYA_CODE_BY_NUMBER,
} from '@/lib/ecotrack'

export type EnsureDraftResult = {
  success: boolean
  tracking?: string
  alreadyExists?: boolean
  error?: string
  status?: number
}

type EcotrackOrderItem = {
  product_name: string
  color_name: string
  size_label: string
  quantity: number
}

export function isInvalidEcotrackTracking(message: string | undefined) {
  const normalized = String(message ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return normalized.includes('tracking') && (
    normalized.includes('invalid') || normalized.includes('invalide')
  )
}

export async function ensureEcotrackDraft(
  supabase: SupabaseClient,
  orderId: string
): Promise<EnsureDraftResult> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, order_items(product_name, color_name, size_label, quantity)')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return { success: false, error: 'الطلب غير موجود', status: 404 }
  }
  if (order.deleted_at) {
    return { success: false, error: 'الطلب موجود في المحذوفات', status: 409 }
  }
  if (order.status !== 'confirmed' || order.ecotrack_status === 'shipped') {
    return { success: false, error: 'يجب أن يكون الطلب مؤكدًا قبل إنشاء البوليصة', status: 409 }
  }
  if (order.ecotrack_tracking) {
    return {
      success: true,
      tracking: order.ecotrack_tracking,
      alreadyExists: true,
    }
  }

  const codeWilaya =
    WILAYA_CODES[String(order.wilaya)] ??
    WILAYA_CODE_BY_NUMBER[String(order.wilaya)] ??
    WILAYA_CODE_BY_NUMBER[String(Number.parseInt(String(order.wilaya), 10))] ??
    0

  if (!codeWilaya) {
    return { success: false, error: `Wilaya not found: ${order.wilaya}`, status: 400 }
  }

  const fallbackCommune = String(order.commune ?? order.wilaya_name ?? order.wilaya)
  const stopDesk = order.delivery_type === 'office' ? 1 : 0
  let commune = fallbackCommune

  if (stopDesk === 1 && !order.commune) {
    const stopDeskCommune = await ecotrackGetStopDeskCommune(codeWilaya)
    if (!stopDeskCommune.success || !stopDeskCommune.commune) {
      return {
        success: false,
        error: 'لا توجد بلدية مكتب متاحة لهذه الولاية في Ecotrack',
        status: 400,
      }
    }
    commune = stopDeskCommune.commune
  }

  const items = (Array.isArray(order.order_items) ? order.order_items : []) as EcotrackOrderItem[]
  const product = items
    .map(item => `${item.product_name} - ${item.color_name} - ${item.size_label} x${item.quantity}`)
    .join(', ')
    .substring(0, 255)

  const created = await ecotrackCreateOrder({
    nom_client: order.customer_name,
    telephone: order.phone,
    telephone_2: order.phone2 ?? undefined,
    adresse: String(order.address ?? fallbackCommune).substring(0, 255),
    commune,
    code_wilaya: codeWilaya,
    montant: Number(order.total_price),
    stop_desk: stopDesk,
    produit: product,
    reference: order.id.slice(-8).toUpperCase(),
  })

  if (!created.success || !created.tracking) {
    return {
      success: false,
      error: created.message || 'تعذّر إنشاء بوليصة Ecotrack',
      status: 502,
    }
  }

  const { data: savedOrder, error: saveError } = await supabase
    .from('orders')
    .update({ ecotrack_tracking: created.tracking, ecotrack_status: 'draft' })
    .eq('id', orderId)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .is('ecotrack_tracking', null)
    .select('id')
    .maybeSingle()

  if (!saveError && savedOrder) {
    return { success: true, tracking: created.tracking }
  }

  const cleanup = await ecotrackDeleteOrder(created.tracking)
  if (!cleanup.success) {
    console.error('Failed to remove unlinked Ecotrack draft:', created.tracking, cleanup.message)
  }

  const { data: latestOrder } = await supabase
    .from('orders')
    .select('ecotrack_tracking')
    .eq('id', orderId)
    .maybeSingle()

  if (latestOrder?.ecotrack_tracking) {
    return {
      success: true,
      tracking: latestOrder.ecotrack_tracking,
      alreadyExists: true,
    }
  }

  return { success: false, error: 'تعذّر حفظ بوليصة التوصيل', status: 500 }
}

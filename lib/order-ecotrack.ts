import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ecotrackCreateOrder,
  ecotrackDeleteOrder,
  ecotrackGetStopDeskCommune,
  WILAYA_CODES,
  WILAYA_CODE_BY_NUMBER,
} from '@/lib/ecotrack'
import {
  fetchAllEcotrackOrders,
  findEcotrackMatch,
  mapEcotrackStatus,
  type MappedEcotrackStatus,
} from '@/lib/ecotrack-sync'

export type EnsureDraftResult = {
  success: boolean
  tracking?: string
  alreadyExists?: boolean
  error?: string
  status?: number
}

export type RecoverTrackingResult = {
  success: boolean
  recovered: boolean
  ambiguous?: boolean
  tracking?: string
  mapped?: MappedEcotrackStatus
  error?: string
  status?: number
}

export type RemoveDraftResult = {
  success: boolean
  tracking: string
  alreadyMissing?: boolean
  relinked?: boolean
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
    .replace(/[’']/g, ' ')

  const mentionsTracking = normalized.includes('tracking') || normalized.includes('suivi')
  const meansMissing = [
    'invalid',
    'invalide',
    'not found',
    'introuvable',
    'does not exist',
    'n existe pas',
  ].some(fragment => normalized.includes(fragment))

  return mentionsTracking && meansMissing
}

export async function recoverEcotrackTracking(
  supabase: SupabaseClient,
  orderId: string
): Promise<RecoverTrackingResult> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, customer_name, phone, phone2, wilaya, total_price, ecotrack_tracking, created_at')
    .eq('id', orderId)
    .is('deleted_at', null)
    .single()

  if (orderError || !order) {
    return { success: false, recovered: false, error: 'الطلب غير موجود', status: 404 }
  }

  const { data: linkedOrders, error: linkedError } = await supabase
    .from('orders')
    .select('ecotrack_tracking')
    .neq('id', orderId)
    .not('ecotrack_tracking', 'is', null)
    .is('deleted_at', null)

  if (linkedError) {
    return { success: false, recovered: false, error: 'تعذّر التحقق من أرقام التتبع', status: 500 }
  }

  let ecotrackOrders
  try {
    ecotrackOrders = await fetchAllEcotrackOrders()
  } catch (error) {
    console.error('Failed to recover changed Ecotrack tracking:', error)
    return { success: false, recovered: false, error: 'تعذّر فحص طلبات Ecotrack', status: 502 }
  }

  const unavailableTrackings = new Set(
    (linkedOrders ?? [])
      .map(linkedOrder => linkedOrder.ecotrack_tracking)
      .filter((tracking): tracking is string => Boolean(tracking))
  )
  const { match, ambiguous } = findEcotrackMatch(ecotrackOrders, order, unavailableTrackings)

  if (ambiguous) {
    return {
      success: true,
      recovered: false,
      ambiguous: true,
      error: 'وجدنا أكثر من بوليصة مشابهة في Ecotrack؛ لم نربط أيًا منها لتجنب الخطأ',
      status: 409,
    }
  }
  if (!match) return { success: true, recovered: false }

  const mapped = mapEcotrackStatus(match.status)
  let update = supabase
    .from('orders')
    .update({
      ecotrack_tracking: match.tracking,
      ecotrack_status: mapped.ecotrack_status,
      status: mapped.status,
    })
    .eq('id', orderId)
    .eq('status', 'confirmed')
    .is('deleted_at', null)

  update = order.ecotrack_tracking
    ? update.eq('ecotrack_tracking', order.ecotrack_tracking)
    : update.is('ecotrack_tracking', null)

  const { data: savedOrder, error: saveError } = await update.select('id').maybeSingle()
  if (saveError || !savedOrder) {
    return {
      success: false,
      recovered: false,
      error: 'تغيّرت حالة الطلب أثناء إصلاح رقم التتبع، حدّثي الصفحة ثم حاولي مجددًا',
      status: 409,
    }
  }

  return { success: true, recovered: true, tracking: match.tracking, mapped }
}

export async function removeEcotrackDraft(
  supabase: SupabaseClient,
  orderId: string,
  currentTracking: string
): Promise<RemoveDraftResult> {
  const firstAttempt = await ecotrackDeleteOrder(currentTracking)
  if (firstAttempt.success) return { success: true, tracking: currentTracking }
  if (!firstAttempt.lookupRequired && !isInvalidEcotrackTracking(firstAttempt.message)) {
    return {
      success: false,
      tracking: currentTracking,
      error: firstAttempt.message || 'تعذّر حذف مسودة Ecotrack',
      status: 502,
    }
  }

  const recovery = await recoverEcotrackTracking(supabase, orderId)
  if (!recovery.success || recovery.ambiguous) {
    return {
      success: false,
      tracking: currentTracking,
      error: recovery.error || 'تعذّر إصلاح رقم تتبع Ecotrack',
      status: recovery.status ?? 502,
    }
  }
  if (!recovery.recovered || !recovery.tracking || !recovery.mapped) {
    return { success: true, tracking: currentTracking, alreadyMissing: true }
  }
  if (recovery.mapped.ecotrack_status === 'shipped') {
    return {
      success: false,
      tracking: recovery.tracking,
      relinked: true,
      error: 'تم العثور على البوليصة في Ecotrack وهي مُرسلة؛ لا يمكن حذفها كمسودة',
      status: 409,
    }
  }
  if (recovery.tracking === currentTracking) {
    return {
      success: false,
      tracking: currentTracking,
      error: firstAttempt.message || 'Ecotrack رفض حذف هذه المسودة',
      status: 502,
    }
  }

  const secondAttempt = await ecotrackDeleteOrder(recovery.tracking)
  const disappearedDuringRecovery =
    !secondAttempt.success && isInvalidEcotrackTracking(secondAttempt.message)
  if (!secondAttempt.success && !disappearedDuringRecovery) {
    return {
      success: false,
      tracking: recovery.tracking,
      relinked: true,
      error: secondAttempt.message || 'تعذّر حذف مسودة Ecotrack',
      status: 502,
    }
  }

  return {
    success: true,
    tracking: recovery.tracking,
    relinked: true,
    alreadyMissing: disappearedDuringRecovery,
  }
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
    if (order.ecotrack_status !== 'draft') {
      return {
        success: false,
        error: 'حالة بوليصة Ecotrack غير متسقة، شغّلي المزامنة ثم حدّثي الصفحة',
        status: 409,
      }
    }

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

import type { Order } from './types'

export type BulkOrderAction = 'confirm' | 'ship'
export type BulkOrderResult = {
  id: string; name: string; success: boolean; message: string; patch: Partial<Order>
}

export function canBulkOrder(order: Order, action: BulkOrderAction) {
  if (order.deleted_at) return false
  return action === 'confirm' ? order.status === 'pending'
    : order.status === 'confirmed' && order.ecotrack_status === 'draft' && Boolean(order.ecotrack_tracking?.trim())
}

// Use the same authenticated, locked endpoints as individual actions. Never
// parallelize shipment mutations or automatically repeat an uncertain request.
export async function runOrderBatch(orders: Order[], action: BulkOrderAction, onResult: (result: BulkOrderResult) => void, stopped: () => boolean) {
  for (const order of orders) {
    if (stopped()) break
    const patch: Partial<Order> = {}
    let confirmed = false
    try {
      const response = await fetch(action === 'confirm' ? `/api/orders/${order.id}` : '/api/ecotrack/ship', {
        method: action === 'confirm' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'confirm' ? { action: 'confirm' } : { order_id: order.id }),
      })
      const result = await response.json()
      if (result.tracking) patch.ecotrack_tracking = result.tracking
      if (result.recreated && !result.success) patch.ecotrack_status = 'draft'
      if (!response.ok || !result.success) throw new Error(result.error || 'تعذّر تنفيذ العملية.')
      let message = 'تم الإرسال للشحن'
      if (action === 'confirm') {
        confirmed = true
        patch.status = 'confirmed'
        const draftResponse = await fetch('/api/ecotrack/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: order.id }),
        })
        const draft = await draftResponse.json()
        if (!draftResponse.ok || !draft.success) throw new Error(draft.error || 'تعذّر إنشاء البوليصة.')
        patch.ecotrack_tracking = draft.tracking
        patch.ecotrack_status = 'draft'
        message = 'تم التأكيد وتجهيز البوليصة'
      } else {
        patch.status = result.status ?? order.status
        patch.ecotrack_status = 'shipped'
        if (result.pending_sync) message = 'تم الإرسال إلى Ecotrack؛ يلزم مزامنة الحالة المحلية'
        else if (result.recreated) message = 'تم الإرسال ببوليصة جديدة؛ أعيدي طباعة البوليصة'
        else if (result.relinked) message = 'تم الربط برقم التتبع الحالي؛ راجعي البوليصة قبل تسليم الطرد'
        else if (result.already_shipped) message = 'الطلب مُرسل للشحن بالفعل'
      }
      onResult({ id: order.id, name: order.customer_name, success: true, message, patch })
    } catch (error) {
      // A failed response can follow a committed confirmation or recovered
      // tracking. Refresh this row without rolling back successful operations.
      try {
        const response = await fetch(`/api/orders/${order.id}`, { cache: 'no-store' })
        const result = await response.json()
        if (response.ok && result.success && result.order) Object.assign(patch, result.order)
      } catch { /* Keep the known successful steps and report the failure. */ }
      const message = error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
        ? error.message : 'تعذّر الاتصال. تحققي من حالة الطلب قبل إعادة المحاولة.'
      onResult({ id: order.id, name: order.customer_name, success: false,
        message: confirmed ? `تم تأكيد الطلب، لكن تجهيز البوليصة لم يكتمل: ${message}` : message, patch })
    }
  }
}

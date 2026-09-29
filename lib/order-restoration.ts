export type OrderRepair = { item_id: string; product_id: string; color_id: string; size_id: string }
export type RestoreIssue = {
  item_id: string; product_id: string | null; color_id: string | null; size_id: string | null
  reason: 'missing_product' | 'missing_color' | 'missing_size' | 'insufficient_stock'
  product_name: string; color_name: string; size_label: string; quantity: number
  available_stock?: number; required_stock?: number
}

export function restoreError(code: string, message: string) {
  if (code === 'PGRST202' || code === '42883') return {
    status: 503, code: 'restore_migration_required', error: 'تحديث الاسترجاع غير مطبّق على قاعدة البيانات. يلزم تطبيق ترحيل إصلاح الاسترجاع.',
  }
  if (message.includes('order_not_found')) return { status: 404, code: 'order_not_found', error: 'الطلب غير موجود' }
  if (message.includes('order_changed')) return { status: 409, code: 'order_changed', error: 'تغيّر الطلب أثناء اختيار البدائل. أعيدي فتح نافذة الاسترجاع لتحميل حالته الحالية.' }
  if (message.includes('empty_order')) return { status: 409, code: 'empty_order', error: 'الطلب لا يحتوي على منتجات، ولا يمكن استرجاعه كطلب فارغ.' }
  if (message.includes('order_locked')) return { status: 409, code: 'order_locked', error: 'الطلب مرتبط بالشحن أو التسليم؛ يجب تسوية حالته قبل استرجاعه.' }
  if (message.includes('invalid_restore_repairs') || message.includes('invalid_order_items')) return {
    status: 400, code: 'invalid_restore_items', error: 'خيارات الاسترجاع أو كميات المنتجات غير صحيحة.',
  }
  return { status: 500, code: 'restore_failed', error: 'تعذّر استرجاع الطلب بسبب خطأ في قاعدة البيانات. لم يكتمل الاسترجاع.' }
}

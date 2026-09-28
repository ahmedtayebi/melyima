import type { Order, OrderItem } from '@/lib/types'

export const orderEditLabels = {
  customer_name: 'اسم الزبون', phone: 'الهاتف', phone2: 'الهاتف الثاني',
  wilaya: 'الولاية', delivery_type: 'نوع التوصيل', commune: 'البلدية', address: 'العنوان',
  delivery_price: 'رسوم التوصيل', total_price: 'إجمالي الطلبية', notes: 'الملاحظة', items: 'المنتجات والمقاسات والكميات',
} as const
export type OrderEditField = keyof typeof orderEditLabels
export type OrderEditState = Record<OrderEditField, string>
type Source = Pick<Order, Exclude<OrderEditField, 'items'>> & {
  order_items?: Pick<OrderItem, 'product_id' | 'color_id' | 'size_id' | 'quantity'>[] | null
}

// Compare the values being edited, not timestamps written by unrelated updates.
export function orderEditState(order: Source): OrderEditState {
  return {
    customer_name: order.customer_name ?? '', phone: order.phone ?? '', phone2: order.phone2 ?? '',
    wilaya: String(order.wilaya ?? '').padStart(2, '0'), delivery_type: order.delivery_type,
    commune: order.commune ?? '', address: order.address ?? '', notes: order.notes ?? '',
    delivery_price: String(Number(order.delivery_price)), total_price: String(Number(order.total_price)),
    items: JSON.stringify((order.order_items ?? []).map(item =>
      JSON.stringify([item.product_id ?? '', item.color_id ?? '', item.size_id ?? '', Number(item.quantity)])
    ).sort()),
  }
}

export function isOrderEditState(value: unknown): value is OrderEditState {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(orderEditLabels).every(key => typeof (value as Record<string, unknown>)[key] === 'string')
}

export function changedOrderEditFields(before: OrderEditState, after: OrderEditState, notesOnly = false) {
  const keys: OrderEditField[] = notesOnly ? ['notes'] : Object.keys(orderEditLabels) as OrderEditField[]
  return keys.filter(key => before[key] !== after[key])
}

// Support an already-open previous client without treating Z and +00:00 as a
// conflict. Preserve fractional microseconds: Date alone truncates precision.
export function sameOrderTimestamp(before: unknown, after: unknown) {
  if (typeof before !== 'string' || typeof after !== 'string') return false
  const micros = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6)
  return Number.isFinite(Date.parse(before)) && Date.parse(before) === Date.parse(after) && micros(before) === micros(after)
}

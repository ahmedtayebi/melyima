import type { SupabaseClient } from '@supabase/supabase-js'
import type { Order } from './types'

const ORDERS_SELECT = `
  id, customer_name, phone, phone2, wilaya, wilaya_name, commune,
  delivery_type, delivery_price, products_total, total_price, address,
  status, notes, created_at, updated_at,
  deleted_at, deleted_from_status,
  ecotrack_tracking, ecotrack_status,
  order_items(id, order_id, product_id, color_id, size_id, product_name, color_name, color_hex, color_image_url, size_label, quantity)
`

export async function loadAdminOrders(db: SupabaseClient): Promise<Order[]> {
  const orders: Order[] = []
  let cursor: string | null = null
  while (true) {
    let query = db.from('orders').select(ORDERS_SELECT).order('id', { ascending: true }).limit(500)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw error
    const rows = (data ?? []) as Order[]
    orders.push(...rows)
    if (rows.length < 500) break
    cursor = rows[rows.length - 1].id
  }
  return orders.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}

import { createClient } from '@/lib/supabase/server'
import OrdersClient from '@/components/admin/OrdersClient'
import type { Order } from '@/lib/types'

export default async function AdminOrdersPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('orders')
    .select(
      `id, customer_name, phone, phone2, wilaya, wilaya_name, commune,
 delivery_type, delivery_price, products_total, total_price, address,
 status, notes, created_at, updated_at,
 ecotrack_tracking, ecotrack_status,
 order_items!inner(id, order_id, product_id, color_id, size_id, product_name, color_name, color_hex, color_image_url, size_label, quantity)`
    )
    .order('created_at', { ascending: false })

  return <OrdersClient initialOrders={(data ?? []) as Order[]} />
}

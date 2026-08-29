import { createClient } from '@/lib/supabase/server'
import OrdersClient from '@/components/admin/OrdersClient'
import type { Order, Product } from '@/lib/types'

export default async function AdminOrdersPage() {
  const supabase = await createClient()

  const [{ data: orders }, { data: products }] = await Promise.all([
    supabase
      .from('orders')
      .select(
        `id, customer_name, phone, phone2, wilaya, wilaya_name, commune,
         delivery_type, delivery_price, products_total, total_price, address,
         status, notes, created_at, updated_at,
         deleted_at, deleted_from_status,
         ecotrack_tracking, ecotrack_status,
         order_items(id, order_id, product_id, color_id, size_id, product_name, color_name, color_hex, color_image_url, size_label, quantity)`
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select(
        `id, name, price, original_price, description, is_visible, category_id, sales_count, created_at, updated_at,
         product_colors(id, product_id, name, hex_code, image_url, is_visible, sort_order),
         product_sizes(id, product_id, label, is_visible, sort_order),
         product_variants(id, product_id, color_id, size_id, stock)`
      )
      .order('name'),
  ])

  return (
    <OrdersClient
      initialOrders={(orders ?? []) as Order[]}
      products={(products ?? []) as Product[]}
    />
  )
}

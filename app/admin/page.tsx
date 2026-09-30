import { createClient } from '@/lib/supabase/server'
import OrdersClient from '@/components/admin/OrdersClient'
import { loadAdminOrders } from '@/lib/admin-orders'
import type { Product } from '@/lib/types'

export default async function AdminOrdersPage() {
  const supabase = await createClient()

  const [orders, { data: products }] = await Promise.all([
    loadAdminOrders(supabase),
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
      initialOrders={orders}
      products={(products ?? []) as Product[]}
    />
  )
}

import { createClient } from '@/lib/supabase/server'
import StatsClient from '@/components/admin/StatsClient'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total_price, products_total, delivery_price, wilaya_name, wilaya, created_at, order_items(product_name, quantity)')
  return <StatsClient orders={orders ?? []} />
}

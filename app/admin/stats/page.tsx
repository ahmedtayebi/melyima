import { createClient } from '@/lib/supabase/server'
import StatsClient from '@/components/admin/StatsClient'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, total_price, products_total, delivery_price, wilaya_name, wilaya, created_at, order_items!inner(product_name, quantity)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-center">
        <p className="font-heading font-bold text-brand">تعذّر تحميل الإحصاءات</p>
        <p className="font-body text-sm text-muted">{error.message}</p>
      </div>
    )
  }

  return <StatsClient orders={orders ?? []} />
}

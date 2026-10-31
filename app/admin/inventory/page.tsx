import { createClient } from '@/lib/supabase/server'
import InventoryClient from '@/components/admin/InventoryClient'
import type { Product } from '@/lib/types'

export default async function AdminInventoryPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select(
      `id, name, price, original_price, description, is_visible, archived_at, category_id, sales_count, created_at, updated_at,
       product_colors(id, product_id, name, hex_code, image_url, is_visible, archived_at, sort_order),
       product_sizes(id, product_id, label, is_visible, archived_at, sort_order),
       product_variants(id, product_id, color_id, size_id, stock)`
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const products = ((data ?? []) as Product[]).map(product => ({
    ...product,
    product_colors: product.product_colors?.filter(color => !color.archived_at),
    product_sizes: product.product_sizes?.filter(size => !size.archived_at),
  }))
  return <InventoryClient initialProducts={products} />
}

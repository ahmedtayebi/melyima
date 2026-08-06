import { createClient } from '@/lib/supabase/server'
import ProductsClient from '@/components/admin/ProductsClient'
import type { Product } from '@/lib/types'

export default async function AdminProductsPage() {
  const supabase = await createClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select(
        `id, name, price, original_price, is_visible, category_id, created_at, updated_at,
         product_colors(id, product_id, name, hex_code, image_url, is_visible),
         product_sizes(id, product_id, label, is_visible, sort_order),
         product_variants(id, product_id, color_id, size_id, stock)`
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true }),
  ])

  return (
    <ProductsClient
      initialProducts={(products ?? []) as Product[]}
      initialCategories={categories ?? []}
    />
  )
}

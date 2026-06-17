import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { TrendingUp } from 'lucide-react'

export const metadata: Metadata = {
  title: 'الأكثر مبيعاً',
  description: 'اكتشفي الأكثر مبيعاً من عباءات MELY•IMA — التشكيلات التي تحظى بأعلى إقبال من زبوناتنا في الجزائر.',
  alternates: { canonical: 'https://melyima.com/best-sellers' },
  openGraph: {
    title: 'الأكثر مبيعاً | MELY•IMA',
    description: 'أكثر العباءات النسائية مبيعاً من MELY•IMA في الجزائر.',
    url: 'https://melyima.com/best-sellers',
  },
}
import ProductCard from '@/components/store/ProductCard'
import type { Product } from '@/lib/types'

const PRODUCTS_SELECT = `
  id, name, price, original_price, description, is_visible, category_id, sales_count, created_at, updated_at,
  product_colors(id, product_id, name, hex_code, image_url, is_visible,
    product_color_images(id, color_id, image_url, sort_order)),
  product_sizes(id, product_id, label, is_visible, sort_order),
  product_variants(id, product_id, color_id, size_id, stock)
`

const mapProduct = (p: any): Product => ({
  id: p.id,
  name: p.name,
  price: p.price ?? 0,
  original_price: p.original_price ?? 0,
  description: p.description ?? null,
  is_visible: p.is_visible,
  category_id: p.category_id ?? null,
  sales_count: p.sales_count ?? 0,
  created_at: p.created_at,
  updated_at: p.updated_at,
  product_colors: (p.product_colors ?? [])
    .filter((c: any) => c.is_visible)
    .map((c: any) => ({
      ...c,
      images: (c.product_color_images ?? [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order),
    })),
  product_sizes: (p.product_sizes ?? [])
    .filter((s: any) => s.is_visible)
    .filter((s: any, i: number, arr: any[]) =>
      arr.findIndex((t: any) => t.label === s.label) === i)
    .sort((a: any, b: any) => a.sort_order - b.sort_order),
  product_variants: p.product_variants ?? [],
})

export default async function BestSellersPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select(PRODUCTS_SELECT)
    .eq('is_visible', true)
    .gt('sales_count', 0)
    .order('sales_count', { ascending: false })
    .limit(6)
    
  const products = (data ?? []).map(mapProduct)

  return (
    <div className="min-h-screen bg-[#FFFDF9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-center gap-3 mb-10">
          <TrendingUp size={28} className="text-brand" />
          <h1 className="font-heading font-black text-3xl text-brand">الأكثر مبيعاً</h1>
        </div>
        {products.length === 0 ? (
          <p className="text-center text-muted font-body py-20">لا توجد منتجات</p>
        ) : (
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-4">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

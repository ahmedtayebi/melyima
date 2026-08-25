import type { Metadata } from 'next'
import { createStaticClient } from '@/lib/supabase/static'
import { Sparkles } from 'lucide-react'

export const metadata: Metadata = {
  title: 'الجديد',
  description: 'أحدث وصولات MELY•IMA من العباءات النسائية العصرية — تشكيلات جديدة بجودة مضمونة. توصيل لجميع ولايات الجزائر.',
  alternates: { canonical: 'https://melyima.com/new-arrivals' },
  openGraph: {
    title: 'الجديد | MELY•IMA',
    description: 'أحدث تشكيلات العباءات النسائية العصرية من MELY•IMA في الجزائر.',
    url: 'https://melyima.com/new-arrivals',
  },
}
import ProductCard from '@/components/store/ProductCard'
import type { Product } from '@/lib/types'

export const revalidate = 3600

const PRODUCTS_SELECT = `
  id, name, price, original_price, description, is_visible, category_id, sales_count, created_at, updated_at,
  product_colors(id, product_id, name, hex_code, image_url, is_visible, sort_order,
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
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
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

export default async function NewArrivalsPage() {
  const supabase = createStaticClient()
  const { data } = await supabase
    .from('products')
    .select(PRODUCTS_SELECT)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
    .limit(24)

  const products = (data ?? []).map(mapProduct)

  return (
    <div className="min-h-screen bg-[#FFFDF9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-center gap-3 mb-10">
          <Sparkles size={28} className="text-brand" />
          <h1 className="font-heading font-black text-3xl text-brand">الجديد</h1>
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

import type { Metadata } from 'next'
import { createStaticClient } from '@/lib/supabase/static'
import { Tag } from 'lucide-react'

export const metadata: Metadata = {
  title: 'التخفيضات',
  description: 'اكتشفي أجمل عروض وتخفيضات العباءات النسائية من MELY•IMA — أسعار مخفضة على أحدث التشكيلات. توصيل لجميع ولايات الجزائر.',
  alternates: { canonical: 'https://melyima.com/discounts' },
  openGraph: {
    title: 'التخفيضات | MELY•IMA',
    description: 'أسعار مخفضة على أجمل تشكيلات العباءات النسائية العصرية في الجزائر.',
    url: 'https://melyima.com/discounts',
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

export default async function DiscountsPage() {
  const supabase = createStaticClient()

  const { data } = await supabase
    .from('products')
    .select(PRODUCTS_SELECT)
    .eq('is_visible', true)
    .gt('original_price', 0)
    .order('created_at', { ascending: false })

  const products: Product[] = (data ?? [])
    .map(mapProduct)
    .filter(p => p.original_price > p.price)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5EDD9' }}>

      {/* Hero banner */}
      <div
        className="w-full py-12 text-center relative overflow-hidden"
        style={{ backgroundColor: '#8B1A2E' }}
      >
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'repeating-linear-gradient(-45deg, #ffffff, #ffffff 1px, transparent 1px, transparent 12px)',
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#e1dbdcff' }}
          >
            <Tag size={24} className="text-#8B1A2E" />
          </div>
          <h1 className="font-heading font-black text-4xl lg:text-5xl text-white">
            التخفيضات
          </h1>
          <p className="font-body text-white/60 text-base">
            {products.length} منتج بأسعار مخفضة
          </p>
          <div className="w-16 h-0.5 mt-2" style={{ backgroundColor: '#8B1A2E' }} />
        </div>
      </div>

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        {products.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-heading font-bold text-xl text-brand mb-2">
              لا توجد تخفيضات حالياً
            </p>
            <p className="text-muted font-body text-sm">
              تابعينا لاكتشاف أحدث العروض
            </p>
          </div>
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

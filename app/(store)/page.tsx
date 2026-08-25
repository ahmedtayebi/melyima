import { createStaticClient } from '@/lib/supabase/static'
import ProductsSection from '@/components/store/ProductsSection'
import BestSellersSection from '@/components/store/BestSellersSection'
import ReviewsSection from '@/components/store/ReviewsSection'
import HeroSection from '@/components/store/HeroSection'
import NewArrivalsSection from '@/components/store/NewArrivalsSection'
import DiscountsSection from '@/components/store/DiscountsSection'
import type { Product, Category, Review } from '@/lib/types'

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

export default async function StorePage() {
  const supabase = createStaticClient()

  const [
    { data: productsData },
    { data: bestSellersData },
    { data: categoriesData },
    { data: reviewsData },
    { data: discountsData },
  ] = await Promise.all([
    supabase
      .from('products')
      .select(PRODUCTS_SELECT)
      .eq('is_visible', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select(PRODUCTS_SELECT)
      .eq('is_visible', true)
      .order('sales_count', { ascending: false })
      .gt('sales_count', 0)
      .limit(6),
    supabase
      .from('categories')
      .select('id, name, sort_order, is_visible')
      .eq('is_visible', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('reviews')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('products')
      .select(PRODUCTS_SELECT)
      .eq('is_visible', true)
      .gt('original_price', 0)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const products: Product[] = (productsData ?? []).map(mapProduct)
  const bestSellers: Product[] = (bestSellersData ?? []).map(mapProduct)
  const categories: Category[] = (categoriesData ?? []) as Category[]
  const reviews: Review[] = (reviewsData ?? []) as Review[]
  const discounts: Product[] = (discountsData ?? [])
    .map(mapProduct)
    .filter(p => p.original_price > p.price)
    .slice(0, 6)

  return (
    <main className="pointer-events-auto">
      <HeroSection />
      <ReviewsSection reviews={reviews} />
      <NewArrivalsSection products={products.slice(0, 6)} />
      <BestSellersSection products={bestSellers} />
      <DiscountsSection products={discounts} />
      <ProductsSection products={products} categories={categories} />
      <StatementSection />
    </main>
  )
}


function StatementSection() {
  const stats = [
    { number: '100%', label: 'جودة مضمونة' },
    { number: 'يومي', label: 'توصيل لكل الولايات' },
    { number: '24/7', label: 'خدمة العملاء' },
  ]

  return (
    <section
      id="statement"
      className="relative py-28 px-6 text-center overflow-hidden"
      style={{ background: 'linear-gradient(165deg, #F5EBD8 0%, #EDE0CC 50%, #F0E8DA 100%)' }}
    >
      {/* Decorative ambient orb */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(184,135,46,0.10) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Watermark */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   font-heading font-black select-none pointer-events-none whitespace-nowrap"
        style={{
          fontSize: 'clamp(70px, 14vw, 160px)',
          color: 'rgba(184,135,46,0.05)',
          letterSpacing: '-0.04em',
        }}
      >
        MELY•IMA
      </div>

      <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center gap-10">

        {/* Eyebrow */}
        <div className="flex items-center gap-3">
          <div
            className="h-px w-8"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(184,135,46,0.6))' }}
          />
          <span
            className="font-heading font-bold text-xs tracking-[0.18em] uppercase"
            style={{ color: '#B8872E' }}
          >
            رؤيتنا
          </span>
          <div
            className="h-px w-8"
            style={{ background: 'linear-gradient(90deg, rgba(184,135,46,0.6), transparent)' }}
          />
        </div>

        {/* Headline */}
        <h2
          className="font-heading font-black text-4xl sm:text-5xl leading-tight"
          style={{ color: '#1A1410' }}
        >
          نحن لا نبيع عباءة
          <br />
          نبيع{' '}
          <span
            style={{
              background: 'linear-gradient(140deg, #8B6420, #C8963C, #E8B850, #B8872E)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ثقتكِ
          </span>{' '}
          بنفسك
        </h2>

        <p className="font-body text-base leading-relaxed max-w-md" style={{ color: '#7A6A58' }}>
          كل عباءة مصممة بعناية لتعكس أناقتك اليومية وتمنحكِ الراحة طوال اليوم
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 w-full mt-2">
          {stats.map(({ number, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl"
              style={{
                background: 'rgba(255,251,244,0.65)',
                border: '1px solid rgba(232,221,208,0.9)',
                boxShadow: '0 2px 16px rgba(26,20,16,0.05)',
              }}
            >
              <span
                className="font-heading font-black text-2xl sm:text-3xl"
                style={{
                  background: 'linear-gradient(140deg, #8B6420, #C8963C, #E8B850)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {number}
              </span>
              <span
                className="font-body text-xs sm:text-sm text-center leading-snug"
                style={{ color: '#7A6A58' }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a
          href="#products"
          className="mt-2 px-9 py-4 rounded-xl font-heading font-black text-sm text-white"
          style={{ background: '#1A1410' }}
        >
          اكتشفي التشكيلة
        </a>

      </div>
    </section>
  )
}

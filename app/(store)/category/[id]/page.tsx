import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createStaticClient } from '@/lib/supabase/static'
import { notFound } from 'next/navigation'
import ProductCard from '@/components/store/ProductCard'
import type { Product } from '@/lib/types'

const BASE_URL = 'https://melyima.com'

export const revalidate = 3600

export async function generateStaticParams() {
  const supabase = createStaticClient()
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('is_visible', true)
  return (data ?? []).map(c => ({ id: c.id }))
}

interface Props {
  params: Promise<{ id: string }>
}

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  const { data: category } = await supabase
    .from('categories')
    .select('name')
    .eq('id', id)
    .eq('is_visible', true)
    .single()

  if (!category) return {}

  const title = category.name
  const description = `تصفحي تشكيلة ${category.name} من MELY•IMA — عباءات نسائية عصرية بجودة مضمونة. توصيل لجميع ولايات الجزائر.`

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/category/${id}`,
    },
    openGraph: {
      title: `${title} | MELY•IMA`,
      description,
      url: `${BASE_URL}/category/${id}`,
    },
  }
}

export default async function CategoryPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: category }, { data: productsData }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name')
      .eq('id', id)
      .eq('is_visible', true)
      .single(),
    supabase
      .from('products')
      .select(PRODUCTS_SELECT)
      .eq('is_visible', true)
      .eq('category_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!category) notFound()

  const products = (productsData ?? []).map(mapProduct)

  return (
    <div className="min-h-screen bg-[#FFFDF9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-heading font-black text-3xl text-brand text-center mb-10">
          {category.name}
        </h1>
        {products.length === 0 ? (
          <p className="text-center text-muted font-body py-20">لا توجد منتجات في هذا القسم</p>
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

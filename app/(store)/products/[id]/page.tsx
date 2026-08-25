import type { Metadata } from 'next'
import { createStaticClient } from '@/lib/supabase/static'
import { notFound } from 'next/navigation'
import ProductDetail from '@/components/store/ProductDetail'
import type { Product, ProductVariant } from '@/lib/types'

const BASE_URL = 'https://melyima.com'

export const revalidate = 3600

export async function generateStaticParams() {
  const supabase = createStaticClient()
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('is_visible', true)
  return (data ?? []).map(p => ({ id: p.id }))
}

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = createStaticClient()

  const { data } = await supabase
    .from('products')
    .select(`
      name, description,
      product_colors(image_url, is_visible, sort_order,
        product_color_images(image_url, sort_order))
    `)
    .eq('id', id)
    .eq('is_visible', true)
    .single()

  if (!data) return {}

  const firstColor = (data.product_colors as any[])
    ?.sort((a: any, b: any) => a.sort_order - b.sort_order)
    .find((c: any) => c.is_visible)
  const firstImage =
    (firstColor?.product_color_images as any[])
      ?.sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.image_url ??
    firstColor?.image_url ??
    null

  const title = data.name
  const description =
    data.description ??
    `اطلبي ${data.name} من MELY•IMA — توصيل لجميع ولايات الجزائر`

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/products/${id}`,
    },
    openGraph: {
      title: `${title} | MELY•IMA`,
      description,
      url: `${BASE_URL}/products/${id}`,
      ...(firstImage && {
        images: [{ url: firstImage, width: 800, height: 800, alt: title }],
      }),
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params
  const supabase = createStaticClient()

  const [{ data }, { data: settingsData }, { data: variantsData }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        id, name, price, original_price, description, is_visible, category_id, created_at, updated_at,
        product_colors(
          id, product_id, name, hex_code, image_url, is_visible, sort_order,
          product_color_images(id, color_id, image_url, sort_order)
        ),
        product_sizes(id, product_id, label, is_visible, sort_order)
      `)
      .eq('id', id)
      .eq('is_visible', true)
      .single(),
    supabase
      .from('store_settings')
      .select('key, value')
      .eq('key', 'store_policy')
      .single(),
    supabase
      .from('product_variants')
      .select('id, product_id, color_id, size_id, stock')
      .eq('product_id', id),
  ])

  if (!data) notFound()

  const storePolicy = settingsData?.value ?? ''

  const product: Product = {
    ...data,
    description: data.description ?? null,
    original_price: (data as any).original_price ?? 0,
    sales_count: (data as any).sales_count ?? 0,
    product_colors: (data.product_colors ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .filter((c: any) => c.is_visible)
      .map((c: any) => ({
        ...c,
        images: (c.product_color_images ?? [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order),
      })),
    product_sizes: (data.product_sizes ?? [])
      .filter((s: any) => s.is_visible)
      .sort((a: any, b: any) => a.sort_order - b.sort_order),
    product_variants: (variantsData ?? []) as ProductVariant[],
  }

  const firstImage =
    product.product_colors?.[0]?.images?.[0]?.image_url ??
    product.product_colors?.[0]?.image_url ??
    null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description && { description: product.description }),
    ...(firstImage && { image: firstImage }),
    brand: { '@type': 'Brand', name: 'MELY•IMA' },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'DZD',
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/products/${product.id}`,
      seller: { '@type': 'Organization', name: 'MELY•IMA' },
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetail
        product={product}
        storePolicy={storePolicy}
        productVariants={(variantsData ?? []) as ProductVariant[]}
      />
    </>
  )
}

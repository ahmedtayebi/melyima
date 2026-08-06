import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProductForm from '@/components/admin/ProductForm'
import type { Product } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select(
        `id, name, price, original_price, description, is_visible, category_id, created_at, updated_at,
         product_colors(id, product_id, name, hex_code, image_url, is_visible,
           product_color_images(id, color_id, image_url, sort_order)),
         product_sizes(id, product_id, label, is_visible, sort_order)`
      )
      .eq('id', id)
      .single(),
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order'),
  ])

  if (!data) notFound()

  const product: Product = {
    ...(data as any),
    description: (data as any).description ?? null,
    product_colors: ((data as any).product_colors ?? []).map((c: any) => ({
      ...c,
      images: (c.product_color_images ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    })),
    product_sizes: ((data as any).product_sizes ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }

  return (
    <ProductForm
      productId={id}
      initialData={product}
      categories={categories ?? []}
    />
  )
}

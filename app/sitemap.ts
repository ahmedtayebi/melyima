import type { MetadataRoute } from 'next'
import { createStaticClient } from '@/lib/supabase/static'

const BASE_URL = 'https://melyima.com'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createStaticClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select('id, updated_at').eq('is_visible', true),
    supabase.from('categories').select('id, updated_at').eq('is_visible', true),
  ])

  const productUrls: MetadataRoute.Sitemap = (products ?? []).map(p => ({
    url: `${BASE_URL}/products/${p.id}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const categoryUrls: MetadataRoute.Sitemap = (categories ?? []).map(c => ({
    url: `${BASE_URL}/category/${c.id}`,
    lastModified: new Date(c.updated_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/new-arrivals`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/best-sellers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/discounts`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    ...productUrls,
    ...categoryUrls,
  ]
}

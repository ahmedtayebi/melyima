import type { MetadataRoute } from 'next'
import { createStaticClient } from '@/lib/supabase/static'

const BASE_URL = 'https://melyima.com'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createStaticClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select('id, updated_at').eq('is_visible', true).order('id'),
    supabase.from('categories').select('id, updated_at').eq('is_visible', true).order('id'),
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
    // These routes have no persisted modification date. Regeneration time is not
    // a content change, and would force a different sitemap on every rebuild.
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/new-arrivals`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/best-sellers`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/discounts`, changeFrequency: 'daily', priority: 0.8 },
    ...productUrls,
    ...categoryUrls,
  ]
}

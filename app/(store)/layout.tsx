import { createStaticClient } from '@/lib/supabase/static'
import StoreLayoutClient from '@/components/store/StoreLayoutClient'
import type { Category } from '@/lib/types'

export const revalidate = 3600

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const supabase = createStaticClient()
  const { data } = await supabase
    .from('categories')
    .select('id, name, sort_order, is_visible, created_at')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  const categories = (data ?? []) as Category[]

  return (
    <StoreLayoutClient categories={categories}>
      {children}
    </StoreLayoutClient>
  )
}

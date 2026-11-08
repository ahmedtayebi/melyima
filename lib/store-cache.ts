import { revalidatePath } from 'next/cache'

type StoreCacheChange =
  | { kind: 'all' | 'categories' | 'reviews' | 'policy' }
  | { kind: 'products' | 'stock'; productIds: readonly (string | null)[] }

// Routine stock changes must not invalidate every product detail page or sitemap.
// Category pages are a pattern deliberately: a moved/archived product must also
// disappear from its former category, not just appear in its current category.
export function invalidateStoreCache(change: StoreCacheChange) {
  if (change.kind === 'all' || change.kind === 'categories') {
    revalidatePath('/(store)', 'layout')
    revalidatePath('/sitemap.xml')
    return
  }
  if (change.kind === 'reviews') {
    revalidatePath('/')
    return
  }
  if (change.kind === 'policy') {
    revalidatePath('/(store)/products/[id]', 'page')
    return
  }
  if (change.kind === 'products' || change.kind === 'stock') {
    const ids = [...new Set(change.productIds.filter((id): id is string => Boolean(id)))]
    if (!ids.length) return
    for (const id of ids) revalidatePath(`/products/${id}`)
    for (const path of ['/', '/new-arrivals', '/best-sellers', '/discounts']) revalidatePath(path)
    revalidatePath('/(store)/category/[id]', 'page')
    if (change.kind === 'products') revalidatePath('/sitemap.xml')
  }
}

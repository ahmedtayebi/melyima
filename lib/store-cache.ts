import { revalidatePath } from 'next/cache'

export function invalidateStoreCache() {
  revalidatePath('/(store)', 'layout')
  revalidatePath('/sitemap.xml')
}
